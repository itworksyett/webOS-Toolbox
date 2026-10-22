from typing import Dict, Any

class RootMatrix:
    """Evaluates webOS firmware and device capabilities for root eligibility and system metrics."""

    @staticmethod
    def check_active_root(client, retries: int = 2) -> bool:
        """Verifies if the TV already has an active, accessible root shell."""
        for attempt in range(retries):
            try:
                res = client.execute_shell("id -u", timeout=2.0)
                if "0" in res.split():
                    return True
                time.sleep(0.2)
            except Exception:
                time.sleep(0.2)
        return False

    @staticmethod
    def get_device_info(client) -> Dict[str, Any]:
        """Queries model name, firmware version, active app, audio, and SDK version."""
        state, msg = client.verify_connection_state()

        info = {
            "connection_state": state,
            "status_message": msg,
            "model": "LG Smart TV" if state != "OFFLINE" else "Device Offline",
            "firmware": "Unknown",
            "sdk": "Unknown",
            "uhd": True,
            "root_active": (state == "ONLINE_ROOTED"),
            "root_version": "Offline" if state == "OFFLINE" else ("Dev Mode (Sideload Ready)" if state == "ONLINE_DEVMODE" else ("Not Rooted" if state != "ONLINE_ROOTED" else "Root Active")),
            "cpu_model": "Quad-Core ARM Cortex-A53",
            "soc_hardware": "m7621",
            "cpu_cores": 4,
            "load_avg": "--",
            "mem_total_mb": 0,
            "mem_avail_mb": 0,
            "swap_used_mb": 0,
            "swappiness": 100,
            "preload_active": False,
            "ads_blocked": False,
            "active_app": "None",
            "volume": 0,
            "muted": False,
            "kernel": "Linux 4.4.84",
            "uptime_str": "--",
            "storage": {
                "app_total_mb": 0,
                "app_used_mb": 0,
                "app_avail_mb": 0,
                "app_pct": 0,
                "data_total_mb": 0,
                "data_used_mb": 0,
                "data_avail_mb": 0,
                "data_pct": 0
            }
        }

        if state == "OFFLINE":
            return info

        if info["root_active"]:
            # 1. Query system properties via Luna Bus
            res = client.luna_send("com.webos.service.tv.systemproperty/getSystemInfo", 
                                   {"keys": ["modelName", "firmwareVersion", "sdkVersion", "UHD"]})
            if res.get("returnValue"):
                info["model"] = res.get("modelName", info["model"])
                info["firmware"] = res.get("firmwareVersion", info["firmware"])
                info["sdk"] = res.get("sdkVersion", info["sdk"])
                info["uhd"] = (res.get("UHD") == "true")
            else:
                nyx_model = client.execute_shell("nyx-cmd DeviceInfo query model_name 2>/dev/null")
                if nyx_model and not nyx_model.startswith("Error"):
                    info["model"] = nyx_model.strip()

                os_ver = client.execute_shell("cat /etc/os-release 2>/dev/null")
                for line in os_ver.splitlines():
                    if "VERSION=" in line:
                        info["sdk"] = line.split("=")[-1].replace('"', '').strip()

            # 2. Query Foreground App & Audio
            app_res = client.luna_send("com.webos.applicationManager/getForegroundAppInfo", {})
            raw_app = app_res.get("appId", "")
            if raw_app:
                app_map = {
                    "com.lampa.tv": "Lampa",
                    "youtube.leanback.v4": "YouTube",
                    "com.webos.app.home": "Home Menu",
                    "com.webos.app.livetv": "Live TV",
                    "netflix": "Netflix",
                    "org.webosbrew.hbchannel": "Homebrew Channel"
                }
                info["active_app"] = app_map.get(raw_app, raw_app)

            vol_res = client.luna_send("com.webos.audio/getVolume", {})
            if vol_res.get("returnValue"):
                info["volume"] = vol_res.get("volume", 0)
                info["muted"] = vol_res.get("muted", False)

            # 3. Query RAM & Swap
            mem_raw = client.execute_shell("free -m")
            for line in mem_raw.splitlines():
                parts = line.split()
                if line.startswith("Mem:") and len(parts) >= 7:
                    try:
                        info["mem_total_mb"] = int(parts[1])
                        info["mem_avail_mb"] = int(parts[6])
                    except ValueError:
                        pass
                elif line.startswith("Swap:") and len(parts) >= 3:
                    try:
                        info["swap_used_mb"] = int(parts[2])
                    except ValueError:
                        pass

            # 4. Query Swappiness
            sw = client.execute_shell("cat /proc/sys/vm/swappiness 2>/dev/null")
            try:
                for line in sw.splitlines():
                    if line.strip().isdigit():
                        info["swappiness"] = int(line.strip())
            except Exception:
                pass

            # 5. Query Root Environment & Version
            root_ver = "Root Shell Active"
            hb_json = client.execute_shell("cat /media/developer/apps/usr/palm/applications/org.webosbrew.hbchannel/appinfo.json 2>/dev/null", timeout=1.2)
            if '"version"' in hb_json:
                try:
                    import json
                    hb_data = json.loads(hb_json)
                    root_ver = f"Homebrew Channel v{hb_data.get('version', '0.7.3')}"
                except Exception:
                    root_ver = "Homebrew Channel (Active)"
            elif client.execute_shell("test -f /var/lib/webosbrew/startup.sh && echo 1", timeout=1.0).strip() == "1":
                root_ver = "webosbrew (Active)"
            info["root_version"] = root_ver

            # 6. Query initial CPU Loadavg
            lavg = client.execute_shell("cat /proc/loadavg 2>/dev/null", timeout=1.0)
            if lavg and len(lavg.split()) >= 2:
                parts = lavg.split()
                info["load_avg"] = f"{parts[0]}, {parts[1]}"

            # 7. Query Kernel, Uptime, and Flash Storage Partitions
            extra_raw = client.execute_shell("uname -r; cat /proc/uptime; df -m /media /mnt/lg/cmn_data 2>/dev/null", timeout=1.5)
            lines = [l.strip() for l in extra_raw.splitlines() if l.strip()]
            if lines:
                info["kernel"] = f"Linux {lines[0]}"
            if len(lines) > 1 and lines[1].split()[0].replace('.', '').isdigit():
                try:
                    sec = float(lines[1].split()[0])
                    hours = int(sec // 3600)
                    minutes = int((sec % 3600) // 60)
                    info["uptime_str"] = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m"
                except Exception:
                    pass
            for l in lines:
                parts = l.split()
                if len(parts) >= 6:
                    if parts[0].endswith("p54") or parts[-1].endswith("appstore") or parts[-1].endswith("media"):
                        try:
                            info["storage"]["app_total_mb"] = int(parts[1])
                            info["storage"]["app_used_mb"] = int(parts[2])
                            info["storage"]["app_avail_mb"] = int(parts[3])
                            info["storage"]["app_pct"] = int(parts[4].replace("%", ""))
                        except Exception:
                            pass
                    elif parts[0].endswith("p53") or parts[-1].endswith("cmn_data"):
                        try:
                            info["storage"]["data_total_mb"] = int(parts[1])
                            info["storage"]["data_used_mb"] = int(parts[2])
                            info["storage"]["data_avail_mb"] = int(parts[3])
                            info["storage"]["data_pct"] = int(parts[4].replace("%", ""))
                        except Exception:
                            pass

        return info

    @staticmethod
    def evaluate_root_path(info: Dict[str, Any]) -> Dict[str, Any]:
        """Categorizes the device into a root vulnerability stack."""
        if info.get("root_active"):
            return {
                "status": "active",
                "badge": "Root Active",
                "badge_color": "#10b981",  # emerald
                "headline": "Full Root Privileges Confirmed",
                "description": "Your TV has unrestricted root shell access enabled. All system optimizations, debloating tools, and Homebrew packages can be managed directly without any exploits.",
                "can_auto_root": False
            }

        if info.get("connection_state") == "OFFLINE":
            return {
                "status": "offline",
                "badge": "Device Unreachable",
                "badge_color": "#ef4444",
                "headline": "TV is Not Responding",
                "description": "Cannot connect to the TV. Ensure the TV is turned on, connected to the same Wi-Fi/LAN, and the IP address is correct.",
                "can_auto_root": False
            }

        sdk = info.get("sdk", "0.0.0")
        try:
            major_sdk = float(sdk[:3])
        except Exception:
            major_sdk = 4.0

        if 4.0 <= major_sdk <= 7.3:
            return {
                "status": "cve_2023_6317",
                "badge": "Network Exploit Available",
                "badge_color": "#3b82f6",
                "headline": "Remote Network Root (CVE-2023-6317)",
                "description": "Eligible for 1-click network rooting via the secondscreen gateway vulnerability. Grants full root and installs Homebrew Channel.",
                "can_auto_root": True,
                "method_name": "CVE-2023-6317 Exploit"
            }
        elif major_sdk < 4.0:
            return {
                "status": "rootmytv",
                "badge": "Web Exploit Available",
                "badge_color": "#3b82f6",
                "headline": "Browser Exploit (RootMyTV v2)",
                "description": "Eligible for browser-based rooting via the RootMyTV downloadManager vulnerability.",
                "can_auto_root": True,
                "method_name": "RootMyTV v2"
            }
        else:
            return {
                "status": "devmode_elevation",
                "badge": "DevMode Root Available",
                "badge_color": "#f59e0b",
                "headline": "Developer Mode Elevation",
                "description": "Direct network vulnerabilities are patched on this firmware. Permanent root can be achieved using official Developer Mode + elevate-service.",
                "can_auto_root": False,
                "method_name": "DevMode Elevation"
            }

    COMPATIBILITY_DATABASE = [
        {
            "series": "LG OLED C3 / G3 / B3 (2023)",
            "webos": "webOS 23 (v8.x)",
            "soc": "Realtek / α9 Gen6",
            "method": "DevMode + Crashd Exploit",
            "status": "TESTED",
            "tested": True,
            "note": "Requires initial pairing via Developer Mode on port 9922, then local privilege elevation."
        },
        {
            "series": "LG OLED C2 / G2 / B2 (2022)",
            "webos": "webOS 22 (v7.x)",
            "soc": "α9 Gen5 / α7 Gen5",
            "method": "DejaVu / Crashd Exploit",
            "status": "TESTED",
            "tested": True,
            "note": "Fully verified. Unlocks Telnet:23 and installs Homebrew Channel."
        },
        {
            "series": "LG OLED C1 / G1 / B1 / A1 (2021)",
            "webos": "webOS 6.0",
            "soc": "α9 Gen4 / α7 Gen4",
            "method": "RootMy.tv v2 / CVE-2023-6317",
            "status": "TESTED",
            "tested": True,
            "note": "RootMy.tv 1-click in browser or network exploit on unpatched FW."
        },
        {
            "series": "LG OLED CX / GX / BX (2020)",
            "webos": "webOS 5.0",
            "soc": "α9 Gen3",
            "method": "RootMy.tv v2 1-Click",
            "status": "TESTED",
            "tested": True,
            "note": "100% reliable 1-click browser exploit via rootmy.tv."
        },
        {
            "series": "LG OLED C9 / E9 / B9 (2019)",
            "webos": "webOS 4.5",
            "soc": "α9 Gen2",
            "method": "RootMy.tv v2 1-Click",
            "status": "TESTED",
            "tested": True,
            "note": "100% reliable 1-click browser exploit."
        },
        {
            "series": "LG OLED C8 / B8 / E8 (2018)",
            "webos": "webOS 4.0",
            "soc": "α9 / α7 Gen1",
            "method": "RootMy.tv v1/v2",
            "status": "TESTED",
            "tested": True,
            "note": "Browser exploit verified. Telnet unlocks instantly."
        },
        {
            "series": "LG OLED C7 / B7 (2017)",
            "webos": "webOS 3.5",
            "soc": "M16p Dual-Core",
            "method": "RootMy.tv v1",
            "status": "TESTED",
            "tested": True,
            "note": "Legacy webOS 3.5 browser exploit."
        },
        {
            "series": "LG UK64xx / UK63xx / UK62xx (2018)",
            "webos": "webOS 4.0 - 4.4",
            "soc": "m7621 Quad-Core A53",
            "method": "RootMy.tv v2 / Homebrew",
            "status": "TESTED",
            "tested": True,
            "note": "Fully supported & tested. Full swap and kernel optimization support."
        },
        {
            "series": "LG UM73xx / UM71xx / UM74xx (2019)",
            "webos": "webOS 4.5",
            "soc": "LM19A Quad-Core A53",
            "method": "RootMy.tv v2 / Homebrew",
            "status": "TESTED",
            "tested": True,
            "note": "Fully supported. Memory optimizations tested."
        },
        {
            "series": "LG UN73xx / UN71xx / UN80xx (2020)",
            "webos": "webOS 5.0",
            "soc": "K7Hp Quad-Core A53",
            "method": "RootMy.tv v2",
            "status": "TESTED",
            "tested": True,
            "note": "Fully supported."
        },
        {
            "series": "LG UP75xx / UP77xx / UP80xx (2021)",
            "webos": "webOS 6.0",
            "soc": "Realtek Quad-Core",
            "method": "RootMy.tv / CVE-2023-6317",
            "status": "TESTED",
            "tested": True,
            "note": "Firmware dependent. If updated past mid-2023, use DevMode."
        },
        {
            "series": "LG UQ80xx / UQ75xx / UQ90xx (2022)",
            "webos": "webOS 22",
            "soc": "Realtek RTD2874",
            "method": "Crashd / DejaVu",
            "status": "TESTED",
            "tested": True,
            "note": "DevMode pairing required prior to exploit."
        },
        {
            "series": "LG UR80xx / UR75xx / UR90xx (2023)",
            "webos": "webOS 23",
            "soc": "Realtek RTD2875",
            "method": "DevMode + Crashd",
            "status": "COMMUNITY",
            "tested": True,
            "note": "Tested on FW 03.30.xx. Later firmwares may require manual downgrade."
        },
        {
            "series": "LG QNED80 / QNED85 / QNED90 (2022-2024)",
            "webos": "webOS 22 - 24",
            "soc": "α7 Gen5 / Gen6",
            "method": "DevMode Elevation / Sideload",
            "status": "COMMUNITY",
            "tested": True,
            "note": "Sideloading verified. Root exploit depends on patch date."
        },
        {
            "series": "LG NANO90 / NANO85 / NANO80 (2020-2021)",
            "webos": "webOS 5.0 - 6.0",
            "soc": "α7 Gen3 / Quad-Core",
            "method": "RootMy.tv v2",
            "status": "TESTED",
            "tested": True,
            "note": "Fully verified on early to mid firmware builds."
        },
        {
            "series": "LG UT80xx / UT90xx / C4 / G4 (2024+)",
            "webos": "webOS 24",
            "soc": "Realtek RTD2885 / α11",
            "method": "DevMode Sideload (No Root Yet)",
            "status": "PATCHED",
            "tested": False,
            "note": "All known local root exploits patched by LG. Use Mode B Developer Mode to sideload apps."
        }
    ]

    @classmethod
    def get_compatibility_database(cls) -> list:
        return cls.COMPATIBILITY_DATABASE
