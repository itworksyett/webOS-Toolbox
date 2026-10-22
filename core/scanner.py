import socket
import time
import subprocess
import re
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any, Callable, Optional

class NetworkScanner:
    """
    Subnet scanner to discover LG webOS TVs on LAN.
    Features:
      1. ARP table fast-path (sub-second discovery for known LAN devices).
      2. Router Flood Protection (strict concurrency limits and pacing).
      3. Multi-port detection (Port 3000 SSAP, Port 23 Telnet root, Port 22 SSH, Port 9922 DevMode).
    """

    @staticmethod
    def get_local_subnet_base() -> str:
        """Determines the primary local IPv4 subnet prefix (e.g. '192.168.1.')."""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
            parts = local_ip.split(".")
            return ".".join(parts[:3]) + "."
        except Exception:
            return "192.168.1."

    @staticmethod
    def _is_port_open(ip: str, port: int, timeout: float = 0.25) -> bool:
        """Checks if a TCP port is open with strict timeout."""
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(timeout)
                return s.connect_ex((ip, port)) == 0
        except Exception:
            return False

    @classmethod
    def probe_host(cls, ip: str, timeout: float = 0.25) -> Optional[Dict[str, Any]]:
        """
        Probes an IP for LG webOS services:
        - 3000: webOS SSAP discovery & remote control
        - 23: Telnet root shell (Homebrew Channel / Crashd)
        - 22: OpenSSH root shell
        - 9922: LG Developer Mode SSH
        """
        # Step 1: Probe webOS discovery port 3000 and Telnet root port 23
        is_3000_open = cls._is_port_open(ip, 3000, timeout)
        has_telnet = cls._is_port_open(ip, 23, timeout)

        if is_3000_open or has_telnet:
            has_ssh = cls._is_port_open(ip, 22, timeout=0.15)
            has_devmode = cls._is_port_open(ip, 9922, timeout=0.15)
            return {
                "ip": ip,
                "is_webos": True,
                "has_telnet": has_telnet,
                "has_ssh": has_ssh,
                "has_devmode": has_devmode,
                "has_ssap": is_3000_open
            }

        # Step 2: Check standalone Developer Mode (port 9922)
        if cls._is_port_open(ip, 9922, timeout=0.15):
            return {
                "ip": ip,
                "is_webos": True,
                "has_telnet": False,
                "has_ssh": False,
                "has_devmode": True,
                "has_ssap": False
            }

        return None

    @classmethod
    def get_arp_candidates(cls, subnet_prefix: str) -> List[str]:
        """Extracts candidate host IPs belonging to the subnet from system ARP table."""
        candidates = []
        try:
            out = subprocess.check_output(["arp", "-a"], text=True, errors="ignore", timeout=2.0)
            pattern = re.escape(subnet_prefix) + r"(\d+)"
            for m in re.findall(pattern, out):
                last_octet = int(m)
                if 1 < last_octet < 255:
                    candidates.append(f"{subnet_prefix}{last_octet}")
        except Exception:
            pass
        return list(dict.fromkeys(candidates))

    @classmethod
    def scan_subnet(cls, subnet_prefix: Optional[str] = None, progress_cb: Optional[Callable[[int, int], None]] = None) -> List[Dict[str, Any]]:
        """
        Scans subnet for webOS TVs.
        Step 1: Inspects local ARP cache candidates first for instantaneous (<0.5s) discovery.
        Step 2: Falls back to paced /24 sweep if no devices are found in ARP cache.
        """
        if not subnet_prefix:
            subnet_prefix = cls.get_local_subnet_base()

        # --- Fast Path: Check ARP table candidates first ---
        arp_candidates = cls.get_arp_candidates(subnet_prefix)
        if arp_candidates:
            found_arp = []
            with ThreadPoolExecutor(max_workers=max(len(arp_candidates), 4)) as executor:
                results = list(executor.map(lambda ip: cls.probe_host(ip, timeout=0.25), arp_candidates))
                for res in results:
                    if res and res.get("is_webos"):
                        found_arp.append(res)
            if found_arp:
                if progress_cb:
                    progress_cb(len(arp_candidates), len(arp_candidates))
                return found_arp

        # --- Fallback: Paced /24 Subnet Sweep ---
        found_devices = []
        ips = [f"{subnet_prefix}{i}" for i in range(1, 255) if f"{subnet_prefix}{i}" not in arp_candidates]
        total = len(ips)
        completed = 0

        # Safe 16 workers with tiny 2ms pacing prevents SYN bursts
        with ThreadPoolExecutor(max_workers=16) as executor:
            futures = []
            for ip in ips:
                futures.append(executor.submit(cls.probe_host, ip, 0.25))
                time.sleep(0.002)

            for fut in futures:
                res = fut.result()
                if res and res.get("is_webos"):
                    found_devices.append(res)
                completed += 1
                if progress_cb:
                    progress_cb(completed, total)

        return found_devices
