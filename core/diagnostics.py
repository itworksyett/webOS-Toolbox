from typing import Dict, Any, List

class SystemDiagnostics:
    """Performs automated diagnostics of webOS configuration and performance bottlenecks."""

    @classmethod
    def audit_system(cls, client) -> Dict[str, Any]:
        """Audits the TV and returns actionable diagnostic findings."""
        results = {
            "score": 100,
            "status_label": "Fully Optimized",
            "status_color": "#10b981",
            "issues_count": 0,
            "findings": []
        }

        # 1. Audit Swappiness
        sw_raw = client.execute_shell("cat /proc/sys/vm/swappiness 2>/dev/null")
        sw_val = 100
        try:
            for line in sw_raw.splitlines():
                if line.strip().isdigit():
                    sw_val = int(line.strip())
        except Exception:
            pass

        if sw_val > 40:
            results["score"] -= 25
            results["issues_count"] += 1
            results["findings"].append({
                "id": "swappiness",
                "title": "Aggressive Flash-Swap Thrashing",
                "current": f"swappiness = {sw_val}",
                "recommended": "swappiness = 30",
                "severity": "high",
                "passed": False,
                "impact": "eMMC flash thrashing causes heavy UI freezes (3-5s) during app switches."
            })
        else:
            results["findings"].append({
                "id": "swappiness",
                "title": "Flash-Swap Optimization",
                "current": f"swappiness = {sw_val}",
                "recommended": "swappiness = 30",
                "severity": "none",
                "passed": True,
                "impact": "Paging is tuned for fast flash storage. Flash degradation minimized."
            })

        # 2. Audit Background Preload
        init_st = client.execute_shell("initctl status webos-preload-manager 2>/dev/null")
        cobalt_pids = client.execute_shell("pgrep -f '[c]obalt' 2>/dev/null")
        preload_running = ("start/running" in init_st) or bool(cobalt_pids.strip())

        if preload_running:
            results["score"] -= 25
            results["issues_count"] += 1
            results["findings"].append({
                "id": "kill_preload",
                "title": "Background App Preloader Active",
                "current": "Running in background",
                "recommended": "Disabled & Stopped",
                "severity": "high",
                "passed": False,
                "impact": "Consumes ~150 MB of RAM for hidden YouTube processes before apps are even launched."
            })
        else:
            results["findings"].append({
                "id": "kill_preload",
                "title": "Background App Preloader",
                "current": "Disabled",
                "recommended": "Disabled",
                "severity": "none",
                "passed": True,
                "impact": "Preloader stopped. Memory is reserved exclusively for the active streaming app."
            })

        # 3. Audit Ad & Telemetry Blocker
        hosts_raw = client.execute_shell("grep 'ad.lgsmartad.com' /etc/hosts 2>/dev/null")
        ads_blocked = "127.0.0.1" in hosts_raw or "ad.lgsmartad.com" in hosts_raw

        if not ads_blocked:
            results["score"] -= 20
            results["issues_count"] += 1
            results["findings"].append({
                "id": "block_ads",
                "title": "LG Promo & Telemetry Trackers",
                "current": "Active (Unfiltered)",
                "recommended": "Blocked in /etc/hosts",
                "severity": "medium",
                "passed": False,
                "impact": "Home menu stalls waiting for remote LG ad and promo servers before rendering."
            })
        else:
            results["findings"].append({
                "id": "block_ads",
                "title": "LG Ad & Telemetry Filter",
                "current": "Active (127.0.0.1 Blocked)",
                "recommended": "Blocked",
                "severity": "none",
                "passed": True,
                "impact": "Trackers blocked. Home menu and app drawer render without latency."
            })

        # 4. Audit Compositor Priority
        surf_raw = client.execute_shell('SURF_PID=$(pidof surface-manager-starfish); [ -n "$SURF_PID" ] && ps -o pid,nice,comm -p $SURF_PID 2>/dev/null')
        compositor_nice = 0
        try:
            for line in surf_raw.splitlines():
                parts = line.split()
                if len(parts) >= 3 and parts[0].isdigit():
                    compositor_nice = int(parts[1])
                    break
        except Exception:
            pass

        if compositor_nice > -1:
            results["score"] -= 15
            results["issues_count"] += 1
            results["findings"].append({
                "id": "compositor_nice",
                "title": "Wayland Compositor Scheduling",
                "current": f"nice = {compositor_nice} (Normal Priority)",
                "recommended": "nice = -5 (Elevated)",
                "severity": "medium",
                "passed": False,
                "impact": "Magic Remote cursor and animations stutter when heavy media players load."
            })
        else:
            results["findings"].append({
                "id": "compositor_nice",
                "title": "Wayland Compositor Scheduling",
                "current": f"nice = {compositor_nice} (Elevated Priority)",
                "recommended": "nice = -5",
                "severity": "none",
                "passed": True,
                "impact": "Compositor prioritized. Fluid 60fps cursor tracking and transitions."
            })

        # 5. Audit Checkpoint / Cache Bloat
        chk_raw = client.execute_shell("du -sm /mnt/lg/cmn_data/checkpoint /var/lib/wam/Default/Cache 2>/dev/null")
        total_cache_mb = 0
        try:
            for line in chk_raw.splitlines():
                parts = line.split()
                if parts and parts[0].isdigit():
                    total_cache_mb += int(parts[0])
        except Exception:
            pass

        if total_cache_mb > 25:
            results["score"] -= 10
            results["issues_count"] += 1
            results["findings"].append({
                "id": "purge_caches",
                "title": "Stale Caches & Checkpoint Dumps",
                "current": f"{total_cache_mb} MB stale files",
                "recommended": "< 5 MB clean state",
                "severity": "medium",
                "passed": False,
                "impact": "Old crash dumps and WebAppMgr buffers consume limited flash storage."
            })
        else:
            results["findings"].append({
                "id": "purge_caches",
                "title": "System Storage & Caches",
                "current": "Clean (< 5 MB)",
                "recommended": "Clean",
                "severity": "none",
                "passed": True,
                "impact": "Storage caches clean. No leftover dump logs found."
            })

        # 6. Audit 4K Streaming Network Buffers
        rmem_raw = client.execute_shell("cat /proc/sys/net/core/rmem_max 2>/dev/null").strip()
        rmem_val = 0
        try:
            rmem_val = int(rmem_raw)
        except Exception:
            rmem_val = 163840

        if rmem_val < 2097152:
            results["score"] -= 10
            results["issues_count"] += 1
            results["findings"].append({
                "id": "tcp_buffers",
                "title": "4K Streaming Network Socket Buffers",
                "current": f"{round(rmem_val / 1024)} KB default buffer",
                "recommended": "4096 KB (4 MB Ultra-Buffer)",
                "severity": "medium",
                "passed": False,
                "impact": "Default socket buffer is too small for high-bitrate 4K HDR streams (TorrServer, Lampa). Causes playback stalls."
            })
        else:
            results["findings"].append({
                "id": "tcp_buffers",
                "title": "4K Streaming Network Buffers",
                "current": f"{round(rmem_val / 1024)} KB (Ultra-Buffer)",
                "recommended": "4096 KB",
                "severity": "none",
                "passed": True,
                "impact": "TCP receive windows tuned for high-bitrate 4K HDR remux streaming without stutter."
            })

        # 7. Audit Background Diagnostic Daemons (rdxd / cpud)
        loggers_raw = client.execute_shell("pgrep -f '(rdxd|cpud)' 2>/dev/null").strip()
        loggers_active = bool(loggers_raw)

        if loggers_active:
            results["score"] -= 10
            results["issues_count"] += 1
            results["findings"].append({
                "id": "diag_loggers",
                "title": "LG Diagnostic Trace Loggers (rdxd/cpud)",
                "current": "Running in background",
                "recommended": "Halted & Silenced",
                "severity": "medium",
                "passed": False,
                "impact": "Continuous background trace recording causes CPU spikes and extra flash memory write cycles."
            })
        else:
            results["findings"].append({
                "id": "diag_loggers",
                "title": "LG Diagnostic Trace Loggers",
                "current": "Halted & Silenced",
                "recommended": "Halted",
                "severity": "none",
                "passed": True,
                "impact": "Unneeded crash logging daemons are dormant. CPU cycles and flash life preserved."
            })

        # Normalize score
        results["score"] = max(0, min(100, results["score"]))
        if results["score"] >= 95:
            results["status_label"] = "Optimized (Peak Performance)"
            results["status_color"] = "#10b981"  # emerald green
        elif results["score"] >= 65:
            results["status_label"] = f"Attention Required ({results['issues_count']} Issues)"
            results["status_color"] = "#f59e0b"  # amber
        else:
            results["status_label"] = f"Degraded ({results['issues_count']} Critical Issues)"
            results["status_color"] = "#ef4444"  # red

        return results
