import socket
import time
import json
import re
import urllib.request
from typing import Optional, Dict, Any, Tuple

class TVClient:
    """Handles communication with LG webOS TVs via Telnet, SSH, and SSAP/HTTP."""
    
    def __init__(self, ip: str = "192.168.1.100", telnet_port: int = 23, ssh_port: int = 22, ssap_port: int = 3000, devmode_port: int = 9922):
        self.ip = ip
        self.telnet_port = telnet_port
        self.ssh_port = ssh_port
        self.ssap_port = ssap_port
        self.devmode_port = devmode_port

    def probe_port(self, port: int, timeout: float = 0.8) -> bool:
        """Check if a specific TCP port is open on the TV."""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(timeout)
            res = s.connect_ex((self.ip, port))
            s.close()
            return res == 0
        except Exception:
            return False

    def probe_http_info(self, timeout: float = 1.0) -> Optional[Dict[str, Any]]:
        """Query basic device information via HTTP endpoint on port 3000."""
        try:
            url = f"http://{self.ip}:{self.ssap_port}/"
            req = urllib.request.Request(url, headers={"User-Agent": "lg-webos-toolbox"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                text = resp.read().decode("utf-8", errors="ignore")
                return {"alive": True, "banner": text.strip()}
        except Exception:
            return None

    def execute_shell(self, cmd: str, timeout: float = 3.5, retries: int = 2) -> str:
        """Execute a shell command over raw Telnet socket with echo suppression and retries."""
        for attempt in range(retries):
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(timeout)
            try:
                s.connect((self.ip, self.telnet_port))
                time.sleep(0.08)
                try:
                    s.recv(2048)  # consume initial login / motd banner
                except Exception:
                    pass

                # Disable remote terminal echo so command is not echoed back
                s.sendall(b"stty -echo 2>/dev/null\n")
                time.sleep(0.04)
                try:
                    s.recv(1024)
                except Exception:
                    pass

                marker = f"__END_{int(time.time() * 1000)}__"
                full_cmd = f"{cmd}; echo {marker}\n".encode("utf-8")
                s.sendall(full_cmd)

                output = b""
                start = time.time()
                while time.time() - start < timeout:
                    try:
                        chunk = s.recv(4096)
                        if not chunk:
                            break
                        output += chunk
                        if marker.encode() in output:
                            break
                    except socket.timeout:
                        break

                s.close()
                text = output.decode("utf-8", errors="ignore")
                if marker in text:
                    text = text.split(marker)[0]

                # Clean lines: remove shell prompts (e.g. '~ # ' or '/home/root # ')
                cleaned_lines = []
                for line in text.replace("\r", "").splitlines():
                    cl = line.strip()
                    if re.match(r'^(~ #|/home/\w+ #|#|\s*$)', cl) or cl == marker:
                        continue
                    if cl.startswith("echo ") and marker in cl:
                        continue
                    if cl:
                        cleaned_lines.append(cl)

                return "\n".join(cleaned_lines).strip()
            except Exception as e:
                try:
                    s.close()
                except Exception:
                    pass
                if attempt == retries - 1:
                    return f"Error: {e}"
                time.sleep(0.3)
        return "Error: Timeout"

    def verify_connection_state(self, retries: int = 3) -> Tuple[str, str]:
        """
        Determines the exact operational state of the TV with automatic retry pacing:
        Handles Wi-Fi socket jitter and telnet handshake delay by retrying up to `retries` times.
        Returns (state, message) where state is:
        - 'ONLINE_ROOTED': Telnet open and id -u returns 0
        - 'ONLINE_DEVMODE': DevMode port 9922 is open
        - 'ONLINE_UNROOTED': HTTP or SSAP port is open, but no root shell
        - 'OFFLINE': No ports respond (TV off, standby, or rebooting)
        """
        # Phase 1: Probe Telnet (port 23)
        for attempt in range(retries):
            if self.probe_port(self.telnet_port, timeout=1.2):
                res = self.execute_shell("id -u", timeout=2.5)
                if "0" in res.split():
                    return ("ONLINE_ROOTED", "Connected with root privileges (telnet:23)")
                time.sleep(0.25)
                res_retry = self.execute_shell("id -u", timeout=2.5)
                if "0" in res_retry.split():
                    return ("ONLINE_ROOTED", "Connected with root privileges (telnet:23)")
            time.sleep(0.25)

        # Phase 2: If port 22 (SSH) is open, this is a rooted TV where telnetd might be momentarily busy
        if self.probe_port(self.ssh_port, timeout=1.0):
            time.sleep(0.3)
            if self.probe_port(self.telnet_port, timeout=1.5):
                res = self.execute_shell("id -u", timeout=2.5)
                if "0" in res.split():
                    return ("ONLINE_ROOTED", "Connected with root privileges (telnet:23)")
            return ("ONLINE_ROOTED", "Connected via SSH root shell (port 22)")

        # Phase 3: Check Developer Mode port 9922
        if self.probe_port(self.devmode_port, timeout=1.0):
            return ("ONLINE_DEVMODE", "Developer Mode online (port 9922). Ready for DevMode pairing.")

        # Phase 4: Check SSAP port 3000 (webOS discovery)
        for attempt in range(2):
            if self.probe_port(self.ssap_port, timeout=1.0):
                # Double-check telnet with extra timeout before assuming unrooted
                if self.probe_port(self.telnet_port, timeout=1.2):
                    res = self.execute_shell("id -u", timeout=2.0)
                    if "0" in res.split():
                        return ("ONLINE_ROOTED", "Connected with root privileges (telnet:23)")
                return ("ONLINE_UNROOTED", "webOS online (port 3000). Root shell and DevMode closed.")
            time.sleep(0.2)

        return ("OFFLINE", "Device unreachable (TV may be powered off, rebooting, or IP incorrect)")

    def luna_send(self, uri: str, payload: dict) -> dict:
        """Call a Luna Bus endpoint on webOS and robustly parse the JSON response."""
        data_str = json.dumps(payload).replace("'", "'\\''")
        cmd = f"luna-send -n 1 -f luna://{uri} '{data_str}'"
        raw = self.execute_shell(cmd)

        # 1. Look for JSON block containing returnValue
        for chunk in re.findall(r'(\{[^{}]*"returnValue"[\s\S]*?\})', raw):
            try:
                return json.loads(chunk)
            except Exception:
                pass

        # 2. Backwards scan from last }
        idx2 = raw.rfind('}')
        if idx2 != -1:
            depth = 0
            for i in range(idx2, -1, -1):
                if raw[i] == '}':
                    depth += 1
                elif raw[i] == '{':
                    depth -= 1
                    if depth == 0:
                        try:
                            return json.loads(raw[i:idx2+1])
                        except Exception:
                            pass

        return {"raw": raw, "returnValue": False}

    def show_toast(self, message: str) -> bool:
        """Display an on-screen toast notification on the TV."""
        res = self.luna_send("com.webos.notification/createToast", {"message": message})
        return res.get("returnValue", False)

    def deploy_file_bytes(self, data: bytes, remote_path: str, timeout: float = 10.0) -> bool:
        """Deploy arbitrary bytes to TV filesystem via base64 python socket pipeline."""
        import base64
        b64 = base64.b64encode(data).decode("ascii")
        
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        try:
            s.connect((self.ip, self.telnet_port))
            time.sleep(0.1)
            try:
                s.recv(2048)
            except Exception:
                pass
            
            # Start python receiver on TV
            receiver_cmd = f"python -c \"import sys, base64; open(sys.argv[1], 'wb').write(base64.b64decode(sys.stdin.read().strip()))\" {remote_path}\n"
            s.sendall(receiver_cmd.encode("utf-8"))
            time.sleep(0.2)
            
            chunk_size = 1024
            for i in range(0, len(b64), chunk_size):
                s.sendall(b64[i:i+chunk_size].encode("ascii"))
                time.sleep(0.01)
                
            s.sendall(b"\n\x04")  # EOF (Ctrl+D)
            time.sleep(0.3)
            s.sendall(f"chmod 755 {remote_path}\n".encode("utf-8"))
            time.sleep(0.2)
            s.close()
            return True
        except Exception:
            return False
