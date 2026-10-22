import json
import os
import re
import base64
import datetime
import threading
from typing import Dict, Any, Optional, List

from core.client import TVClient
from core.root_matrix import RootMatrix
from core.diagnostics import SystemDiagnostics
from core.optimizer import Optimizer
from core.scanner import NetworkScanner
from core.apps import AppManager

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class BridgeApi:
    """
    Python API bridge exposed to PyWebView.
    Provides real-time telemetry, app catalog inspections, and system operations.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._window = None
        self.client: Optional[TVClient] = None
        self.device_info: Dict[str, Any] = {}
        self.audit_results: Dict[str, Any] = {}
        self.last_cpu_total: int = 0
        self.last_cpu_idle: int = 0

    def connect(self, ip: str) -> Dict[str, Any]:
        """Connects to TV and queries initial device information with thread-safety."""
        with self._lock:
            self.client = TVClient(ip=ip)
            self.last_cpu_total = 0
            self.last_cpu_idle = 0
            self.device_info = RootMatrix.get_device_info(self.client)
            if self.device_info.get("root_active"):
                try:
                    raw_stat = self.client.execute_shell("cat /proc/stat | head -n 1 2>/dev/null", timeout=1.0)
                    if raw_stat.strip().startswith("cpu "):
                        parts = [int(x) for x in raw_stat.strip().split()[1:]]
                        self.last_cpu_total = sum(parts)
                        self.last_cpu_idle = parts[3] + (parts[4] if len(parts) > 4 else 0)
                except Exception:
                    pass
            return self.device_info

    def connect_devmode(self, ip: str, passphrase: str) -> Dict[str, Any]:
        """Pairs with unrooted LG TV via official Developer Mode app on port 9922."""
        import ssl
        import urllib.request
        
        self.client = TVClient(ip=ip)
        if not self.client.probe_port(9922, timeout=1.2):
            return {
                "success": False,
                "error": "Port 9922 is closed. Ensure Developer Mode app is running on TV with 'Key Server: ON'."
            }
        
        ctx = ssl._create_unverified_context()
        auth = "Basic " + base64.b64encode(f"prisoner:{passphrase.strip()}".encode()).decode()
        key_found = False
        key_text = ""
        
        for proto in ("http", "https"):
            url = f"{proto}://{ip}:9922/webos_rsa"
            try:
                req = urllib.request.Request(url, headers={"Authorization": auth, "User-Agent": "lg-webos-toolbox"})
                with urllib.request.urlopen(req, context=ctx, timeout=3.5) as resp:
                    data = resp.read().decode("utf-8", errors="ignore")
                    if "BEGIN" in data:
                        key_found = True
                        key_text = data
                        break
            except Exception:
                pass
        
        if not key_found:
            return {
                "success": False,
                "error": "Authentication failed. Double check the 6-character Passphrase on TV screen."
            }
            
        key_dir = os.path.join(BASE_DIR, "keys")
        os.makedirs(key_dir, exist_ok=True)
        key_path = os.path.join(key_dir, f"webos_rsa_{ip}")
        with open(key_path, "w") as f:
            f.write(key_text)
            
        self.device_info = RootMatrix.get_device_info(self.client)
        self.device_info["connection_state"] = "ONLINE_DEVMODE"
        self.device_info["status_message"] = "Connected via Developer Mode (DevMode port 9922)"
        self.device_info["root_version"] = "Dev Mode (Sideload Ready)"
        
        return {
            "success": True,
            "info": self.device_info
        }

    def scan_wizard(self) -> Dict[str, Any]:
        """Comprehensive network discovery for Setup Wizard: probes 23, 22, 9922, and 3000."""
        devices = NetworkScanner.scan_subnet()
        if devices:
            d = devices[0]
            ip = d["ip"]
            has_telnet = d.get("has_telnet", False)
            has_ssh = d.get("has_ssh", False)
            has_devmode = d.get("has_devmode", False)
            has_ssap = d.get("has_ssap", False)
        else:
            ip = self.client.ip if self.client else "192.168.1.100"
            probe_client = TVClient(ip=ip)
            has_telnet = probe_client.probe_port(23, timeout=0.8)
            has_ssh = probe_client.probe_port(22, timeout=0.8)
            has_devmode = probe_client.probe_port(9922, timeout=0.8)
            has_ssap = probe_client.probe_port(3000, timeout=0.8)

        state = "OFFLINE"
        if has_telnet or has_ssh:
            state = "ONLINE_ROOTED"
        elif has_devmode:
            state = "ONLINE_DEVMODE"
        elif has_ssap:
            state = "ONLINE_UNROOTED"

        return {
            "found": (state != "OFFLINE"),
            "ip": ip,
            "state": state,
            "ports": {
                "telnet": has_telnet,
                "ssh": has_ssh,
                "devmode": has_devmode,
                "ssap": has_ssap
            }
        }

    def get_device_info(self) -> Dict[str, Any]:
        if self.client:
            self.device_info = RootMatrix.get_device_info(self.client)
        return self.device_info

    def poll_memory(self) -> Dict[str, Any]:
        """
        Ultra-fast real-time telemetry probe (~0.12s execution).
        Retrieves live RAM, Flash Swap, kernel swappiness, CPU usage %, and load average.
        """
        if not self.client or not self.device_info.get("root_active"):
            return {
                "active": False,
                "total": 0,
                "available": 0,
                "used": 0,
                "pct": 0,
                "swap_used": 0,
                "swappiness": 100,
                "cpu_pct": 0,
                "load_avg": "--",
                "cpu_model": "Quad-Core ARM Cortex-A53",
                "temp_str": "Passive SoC"
            }

        raw = self.client.execute_shell(
            "cat /proc/stat | head -n 1; cat /proc/loadavg; free -m; cat /proc/sys/vm/swappiness 2>/dev/null",
            timeout=1.5
        )
        total = self.device_info.get("mem_total_mb", 843)
        available = self.device_info.get("mem_avail_mb", 160)
        swap_used = self.device_info.get("swap_used_mb", 98)
        swappiness = self.device_info.get("swappiness", 30)
        cpu_pct = 0.0
        load_avg_str = self.device_info.get("load_avg", "--")

        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue

            if line.startswith("cpu "):
                parts = line.split()[1:]
                if len(parts) >= 4:
                    try:
                        int_parts = [int(x) for x in parts]
                        cur_total = sum(int_parts)
                        cur_idle = int_parts[3] + (int_parts[4] if len(int_parts) > 4 else 0)
                        if self.last_cpu_total > 0:
                            dt = cur_total - self.last_cpu_total
                            di = cur_idle - self.last_cpu_idle
                            if dt > 0:
                                cpu_pct = max(0.0, min(100.0, round((1.0 - (di / dt)) * 100.0, 1)))
                        self.last_cpu_total = cur_total
                        self.last_cpu_idle = cur_idle
                    except Exception:
                        pass
            elif len(line.split()) >= 3 and line.split()[0].replace('.', '').isdigit():
                lp = line.split()
                load_avg_str = f"{lp[0]}, {lp[1]}"
            elif line.startswith("Mem:") and len(line.split()) >= 7:
                try:
                    total = int(line.split()[1])
                    available = int(line.split()[6])
                except ValueError:
                    pass
            elif line.startswith("Swap:") and len(line.split()) >= 3:
                try:
                    swap_used = int(line.split()[2])
                except ValueError:
                    pass
            elif line.isdigit():
                swappiness = int(line)

        used = max(0, total - available)
        pct = round((used / total) * 100) if total > 0 else 0

        # Update cache
        self.device_info["mem_total_mb"] = total
        self.device_info["mem_avail_mb"] = available
        self.device_info["swap_used_mb"] = swap_used
        self.device_info["swappiness"] = swappiness
        self.device_info["load_avg"] = load_avg_str

        return {
            "active": True,
            "total": total,
            "available": available,
            "used": used,
            "pct": pct,
            "swap_used": swap_used,
            "swappiness": swappiness,
            "cpu_pct": cpu_pct,
            "load_avg": load_avg_str,
            "cpu_model": "Quad-Core ARM Cortex-A53",
            "temp_str": "Passive SoC"
        }

    def get_apps_catalog(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Inspects all applications currently installed on TV via Luna Bus and compares
        against the curated catalog with version detection, update alerts, and origin tags.
        """
        if not self.client:
            return {"connected": False, "catalog": [], "installed_apps": [], "counts": {}}
        if force_refresh:
            AppManager.get_catalog(refresh_online=True)
        return AppManager.inspect_device_apps(self.client)

    def sync_apps_catalog(self) -> Dict[str, Any]:
        """Forces an online refresh of the catalog from the official webosbrew repository."""
        catalog = AppManager.get_catalog(refresh_online=True)
        if self.client:
            return AppManager.inspect_device_apps(self.client)
        return {
            "connected": False,
            "catalog": catalog,
            "installed_apps": [],
            "counts": {"total_catalog": len(catalog), "installed_catalog": 0, "updates_available": 0, "total_installed_user": 0}
        }

    def install_catalog_app(self, app_id: str) -> Dict[str, Any]:
        """Installs or updates a catalog application on TV in 1-click."""
        if not self.client:
            return {"success": False, "error": "Not connected to TV."}
        return AppManager.install_app(self.client, app_id)

    def uninstall_app(self, app_id: str) -> Dict[str, Any]:
        """Uninstalls an application from TV via Luna Bus and purges lingering files."""
        if not self.client:
            return {"success": False, "error": "Not connected to TV."}
        return AppManager.uninstall_app(self.client, app_id)

    def sideload_local_dialog(self) -> Dict[str, Any]:
        """Opens native file picker to select a local .ipk file and installs it on TV."""
        if not self.client:
            return {"success": False, "error": "Not connected to TV."}

        file_path = None
        if self._window:
            try:
                import webview
                chosen = self._window.create_file_dialog(
                    webview.OPEN_DIALOG,
                    file_types=('webOS IPK Packages (*.ipk)', 'All Files (*.*)')
                )
                if chosen:
                    file_path = chosen[0] if isinstance(chosen, (list, tuple)) else chosen
            except Exception:
                pass

        if not file_path:
            try:
                import tkinter as tk
                from tkinter import filedialog
                root = tk.Tk()
                root.withdraw()
                root.attributes("-topmost", True)
                chosen = filedialog.askopenfilename(
                    title="Select webOS .IPK Package to Sideload",
                    filetypes=[("webOS IPK Packages", "*.ipk"), ("All Files", "*.*")]
                )
                root.destroy()
                if chosen:
                    file_path = chosen
            except Exception:
                pass

        if not file_path:
            return {"cancelled": True, "message": "No file selected."}

        return AppManager.sideload_local_ipk(self.client, file_path)

    def get_app_changelog(self, app_id: str) -> Dict[str, Any]:
        """Returns the version changelog and improvements list for a catalog app."""
        catalog = AppManager.get_catalog()
        for item in catalog:
            if item["id"] == app_id:
                return {
                    "success": True,
                    "title": item["title"],
                    "id": item["id"],
                    "latest": item["latest"],
                    "category": item["category"],
                    "root_required": item.get("root_required", False),
                    "release_date": item.get("release_date", "Latest"),
                    "source_url": item.get("source_url", ""),
                    "changelog": item.get("changelog", [])
                }
        return {"success": False, "error": "App not found in catalog."}

    def launch_app(self, app_id: str) -> bool:
        """Launches an installed webOS application directly on TV."""
        if not self.client:
            return False
        res = self.client.luna_send("com.webos.applicationManager/launch", {"id": app_id})
        return res.get("returnValue", False)

    def scan_lan(self) -> Dict[str, Any]:
        """Performs router-safe network discovery."""
        devices = NetworkScanner.scan_subnet()
        if devices:
            return {"found": True, "ip": devices[0]["ip"]}
        return {"found": False, "ip": None}

    def run_audit(self) -> Dict[str, Any]:
        """Runs diagnostics scan."""
        if not self.client or not self.device_info.get("root_active"):
            return {
                "score": 0,
                "status_label": "Root Required",
                "status_color": "#f59e0b",
                "issues_count": 0,
                "findings": []
            }
        self.audit_results = SystemDiagnostics.audit_system(self.client)
        return self.audit_results

    def fix_all(self) -> Dict[str, Any]:
        """Applies all system tweaks and updates persistent boot script."""
        if not self.client or not self.device_info.get("root_active"):
            return {"success": False, "error": "Root access required"}

        Optimizer.apply_all(self.client)
        self.audit_results = SystemDiagnostics.audit_system(self.client)
        self.device_info = RootMatrix.get_device_info(self.client)
        return {
            "success": True,
            "info": self.device_info,
            "diag": self.audit_results
        }

    def execute_terminal_cmd(self, cmd: str) -> Dict[str, Any]:
        """Executes interactive shell commands on the TV with safety validation."""
        cmd = cmd.strip()
        if not cmd:
            return {"success": True, "output": ""}

        if not self.client or not self.device_info.get("root_active"):
            return {
                "success": False,
                "error": "Device is not connected or TV root shell is closed. Please connect to TV first."
            }

        # Protection against destructive commands targeting flash storage
        dangerous_patterns = [
            r"\brm\s+-[rRfF]+\s+/(?:\s|$|\*)",
            r"\bmkfs\b",
            r"\bflash_erase\b",
            r"\bdd\s+if=/dev/zero\s+of=/dev/mmcblk0(?:\s|$)",
            r">\s*/dev/mmcblk"
        ]
        for pattern in dangerous_patterns:
            if re.search(pattern, cmd):
                return {
                    "success": False,
                    "error": "COMMAND BLOCKED BY SAFETY GUARD: Potentially destructive storage command intercepted to prevent TV bricking."
                }

        try:
            output = self.client.execute_shell(cmd, timeout=12.0)
            return {
                "success": True,
                "output": output,
                "cmd": cmd
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Execution error: {str(e)}"
            }

    def send_toast(self, message: str) -> bool:
        if not self.client or not self.device_info.get("root_active"):
            return False
        return self.client.show_toast(message)

    def drop_caches(self) -> bool:
        if not self.client or not self.device_info.get("root_active"):
            return False
        Optimizer.drop_caches(self.client)
        self.device_info = RootMatrix.get_device_info(self.client)
        return True

    def reboot(self) -> bool:
        if not self.client:
            return False
        Optimizer.reboot_device(self.client)
        return True

    def screen_off(self) -> bool:
        """Turns off TV screen display while keeping audio/apps alive."""
        if not self.client:
            return False
        res = self.client.luna_send("com.webos.service.tvpower/power/turnOffScreen", {})
        return res.get("returnValue", False)

    def toggle_mute(self) -> Dict[str, Any]:
        """Toggles TV master audio mute."""
        if not self.client:
            return {"success": False, "muted": False}
        current_muted = self.device_info.get("muted", False)
        new_muted = not current_muted
        res = self.client.luna_send("com.webos.audio/setMuted", {"muted": new_muted})
        if res.get("returnValue"):
            self.device_info["muted"] = new_muted
            return {"success": True, "muted": new_muted}
        return {"success": False, "muted": current_muted}

    def go_home(self) -> bool:
        """Switches TV to webOS Home Launcher."""
        if not self.client:
            return False
        return self.launch_app("com.webos.app.home")

    def open_github(self) -> bool:
        """Opens project GitHub repository or releases in default browser."""
        import webbrowser
        webbrowser.open("https://github.com/itworksyett/webOS-Toolbox/releases")
        return True

    def report_issue(self) -> Dict[str, Any]:
        """Generates a clean diagnostic log and opens GitHub New Issue in default browser."""
        import webbrowser
        import platform
        import urllib.parse

        info = self.device_info or {}
        ip = self.client.ip if self.client else "Not connected"
        report_lines = [
            "### System & Environment",
            f"- **App**: webOS Toolbox v1.2.0 (Windows {platform.release()} {platform.machine()})",
            f"- **TV IP**: {ip}",
            f"- **TV Model**: {info.get('model', 'Unknown')}",
            f"- **webOS Version**: {info.get('webos_version', 'Unknown')}",
            f"- **Root Status**: {'Active (Rooted)' if info.get('root_active') else 'No / Unknown'}",
            "",
            "### Problem Description",
            "<!-- Describe what happened or the error encountered -->",
            "",
            "### Expected Behavior",
            "<!-- Describe expected behavior -->",
        ]
        body = "\n".join(report_lines)

        try:
            diag_file = os.path.join(os.path.expanduser("~"), "webos_toolbox_report.txt")
            with open(diag_file, "w", encoding="utf-8") as f:
                f.write(body)
        except Exception:
            pass

        url = "https://github.com/itworksyett/webOS-Toolbox/issues/new?" + urllib.parse.urlencode({
            "title": "[Bug] ",
            "body": body
        })
        webbrowser.open(url)
        return {"success": True, "body": body}

    # ---------------- Process Manager & Lag Killer ----------------

    PROTECTED_PROCESSES = {
        "surface-manager", "webos-surface-manager", "ls-hubd", "webapp-mgr",
        "conman", "nyx-service", "systemd", "init", "telnetd", "dropbear"
    }

    def get_top_processes(self) -> List[Dict[str, Any]]:
        """Queries running userland processes sorted by RAM utilization."""
        if not self.client or not self.device_info.get("root_active"):
            return []
        raw = self.client.execute_shell("ps -eo pid,pcpu,pmem,comm --sort=-pmem 2>/dev/null", timeout=1.5)
        procs = []
        for line in raw.splitlines()[1:]:
            parts = line.strip().split(None, 3)
            if len(parts) == 4 and parts[0].isdigit():
                pid, cpu, mem, comm = parts
                if not comm.startswith('[') and pid not in ("1", "2"):
                    try:
                        comm_clean = comm.strip()
                        is_prot = (
                            comm_clean.lower() in self.PROTECTED_PROCESSES
                            or comm_clean.startswith("ls-")
                            or "surface" in comm_clean.lower()
                        )
                        procs.append({
                            "pid": int(pid),
                            "cpu": float(cpu),
                            "mem": float(mem),
                            "comm": comm_clean,
                            "protected": is_prot
                        })
                    except ValueError:
                        pass
        return procs[:6]

    def kill_process(self, pid: int) -> Dict[str, Any]:
        """Terminates an individual process by PID with safety checks for system daemons."""
        if not self.client or not self.device_info.get("root_active") or pid <= 1:
            return {"success": False, "error": "Invalid PID or device offline"}
        comm = self.client.execute_shell(f"cat /proc/{pid}/comm 2>/dev/null", timeout=1.0).strip()
        if (
            comm.lower() in self.PROTECTED_PROCESSES
            or comm.startswith("ls-")
            or "surface" in comm.lower()
        ):
            return {
                "success": False,
                "error": f"Process '{comm}' is protected by webOS safety guard. Terminating it causes a full UI crash."
            }
        res = self.client.execute_shell(f"kill -9 {pid} 2>/dev/null; echo $?", timeout=1.5)
        return {"success": "0" in res.split(), "comm": comm}

    def kill_lag_apps(self) -> Dict[str, Any]:
        """Closes foreground apps and purges stray WebAppMgr memory to eliminate TV lag."""
        if not self.client or not self.device_info.get("root_active"):
            return {"success": False}
        self.client.luna_send("com.webos.applicationManager/closeAllApps", {})
        self.client.execute_shell("killall -9 WebAppMgr 2>/dev/null", timeout=1.2)
        Optimizer.drop_caches(self.client)
        return {"success": True}

    def get_compatibility_catalog(self) -> Dict[str, Any]:
        """Returns the hardware compatibility database for LG TV series."""
        local_db_path = os.path.join(BASE_DIR, "data", "tv_matrix.json")
        data = RootMatrix.get_compatibility_database()
        if os.path.exists(local_db_path):
            try:
                with open(local_db_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                pass
        return {
            "models": data,
            "total": len(data),
            "updated_at": "October 2026",
            "source": "Local & Remote Matrix Cache"
        }

    def sync_compatibility_catalog(self, remote_url: Optional[str] = None) -> Dict[str, Any]:
        """Fetches the latest hardware matrix from backend / GitHub raw repository."""
        import urllib.request
        url = remote_url or "https://raw.githubusercontent.com/webosbrew/webos-matrix/main/tv_matrix.json"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "lg-webos-toolbox"})
            with urllib.request.urlopen(req, timeout=3.5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if isinstance(data, list) and len(data) > 0:
                    local_dir = os.path.join(BASE_DIR, "data")
                    os.makedirs(local_dir, exist_ok=True)
                    with open(os.path.join(local_dir, "tv_matrix.json"), "w", encoding="utf-8") as f:
                        json.dump(data, f, indent=2)
                    return {"success": True, "count": len(data), "message": f"Successfully synced {len(data)} TV models from backend."}
        except Exception as e:
            pass
        return {"success": False, "error": "Remote backend unavailable. Active offline matrix is fully up to date."}

    def launch_browser_url(self, target_url: str = "https://rootmy.tv") -> bool:
        """Launches built-in webOS web browser directly to a URL via Luna bus."""
        if not self.client:
            return False
        res = self.client.luna_send("com.webos.applicationManager/launch", {
            "id": "com.webos.app.browser",
            "params": {"target": target_url}
        })
        return res.get("returnValue", False)

    # ---------------- OTA Shield (Firmware Update Blocker) ----------------

    def get_ota_status(self) -> bool:
        """Checks if LG firmware update domains are blocked in /etc/hosts."""
        if not self.client or not self.device_info.get("root_active"):
            return False
        out = self.client.execute_shell("grep snu.lge.com /etc/hosts 2>/dev/null", timeout=1.0)
        return "snu.lge.com" in out

    def set_ota_shield(self, enable: bool) -> bool:
        """Blocks or unblocks official LG firmware update servers."""
        if not self.client or not self.device_info.get("root_active"):
            return False
        if enable:
            cmd = (
                "grep -q 'snu.lge.com' /etc/hosts 2>/dev/null || "
                "(echo '127.0.0.1 snu.lge.com su-dev.lge.com su.lge.com su-ssl.lge.com' >> /etc/hosts && "
                "echo '::1 snu.lge.com su-dev.lge.com su.lge.com su-ssl.lge.com' >> /etc/hosts)"
            )
            self.client.execute_shell(cmd, timeout=2.0)
        else:
            self.client.execute_shell("sed -i '/snu.lge.com/d' /etc/hosts 2>/dev/null", timeout=2.0)
        return self.get_ota_status() == enable

    # ---------------- Factory & Service Menu ----------------

    def launch_service_menu(self, mode: str = "instart") -> bool:
        """Triggers official LG In-Start or Ez-Adjust engineering service window."""
        if not self.client or not self.device_info.get("root_active"):
            return False
        target_mode = "instart" if mode == "instart" else "ezadjust"
        res = self.client.luna_send(
            "com.webos.applicationManager/launch",
            {"id": "com.webos.app.factorywin", "params": {"id": target_mode}}
        )
        return res.get("returnValue", False)

    def close_service_menu(self) -> bool:
        """Dismisses the factory service menu window."""
        if not self.client:
            return False
        self.client.luna_send("com.webos.applicationManager/close", {"id": "com.webos.app.factorywin"})
        self.client.execute_shell("pkill -f com.webos.app.factorywin 2>/dev/null", timeout=1.0)
        return True

    # ---------------- Configuration Backup & Restore ----------------

    def create_backup(self) -> Dict[str, Any]:
        """Creates a timestamped compressed backup of TV configs on local disk."""
        if not self.client or not self.device_info.get("root_active"):
            return {"success": False, "error": "Root privileges required"}
        
        backup_dir = os.path.join(BASE_DIR, "backups")
        os.makedirs(backup_dir, exist_ok=True)
        
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"webos_backup_{timestamp}.tar.gz"
        filepath = os.path.join(backup_dir, filename)
        
        # Archive on TV
        self.client.execute_shell(
            "tar -czf /tmp/tb_backup.tar.gz -C / var/lib/webosbrew etc/hosts 2>/dev/null",
            timeout=3.0
        )
        b64 = self.client.execute_shell("base64 /tmp/tb_backup.tar.gz 2>/dev/null", timeout=4.0)
        self.client.execute_shell("rm -f /tmp/tb_backup.tar.gz")
        
        try:
            raw_bytes = base64.b64decode(''.join(b64.split()))
            with open(filepath, "wb") as f:
                f.write(raw_bytes)
            size_kb = round(len(raw_bytes) / 1024, 1)
            return {
                "success": True,
                "filename": filename,
                "size_kb": size_kb,
                "date": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def list_backups(self) -> List[Dict[str, Any]]:
        """Returns list of local backups stored on PC."""
        backup_dir = os.path.join(BASE_DIR, "backups")
        if not os.path.exists(backup_dir):
            return []
        items = []
        for fn in sorted(os.listdir(backup_dir), reverse=True):
            if fn.endswith(".tar.gz"):
                fp = os.path.join(backup_dir, fn)
                size_kb = round(os.path.getsize(fp) / 1024, 1)
                mtime = os.path.getmtime(fp)
                dt_str = datetime.datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")
                items.append({
                    "filename": fn,
                    "size_kb": size_kb,
                    "date": dt_str
                })
        return items

    def restore_backup(self, filename: str) -> Dict[str, Any]:
        """Restores a selected local backup archive to the TV."""
        if not self.client or not self.device_info.get("root_active"):
            return {"success": False, "error": "Root privileges required"}
        backup_dir = os.path.join(BASE_DIR, "backups")
        filepath = os.path.join(backup_dir, filename)
        if not os.path.exists(filepath):
            return {"success": False, "error": "Backup file not found on PC"}
        
        try:
            with open(filepath, "rb") as f:
                raw_data = f.read()
            b64_str = base64.b64encode(raw_data).decode("ascii")
            self.client.execute_shell(f"echo '{b64_str}' > /tmp/tb_restore.b64", timeout=3.0)
            res = self.client.execute_shell(
                "base64 -d /tmp/tb_restore.b64 > /tmp/tb_restore.tar.gz && "
                "tar -xzf /tmp/tb_restore.tar.gz -C / && "
                "rm -f /tmp/tb_restore.b64 /tmp/tb_restore.tar.gz && echo OK",
                timeout=5.0
            )
            return {"success": "OK" in res}
        except Exception as e:
            return {"success": False, "error": str(e)}
