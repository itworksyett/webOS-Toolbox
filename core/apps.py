"""
lg-webos-toolbox: App Catalog, Sideloading Engine & Package Manager.
Provides online catalog syncing with webosbrew repo and community sources,
version comparison, 1-click Luna installation/uninstallation, and local .ipk sideloading.
"""

import os
import json
import time
import socket
import threading
import urllib.request
import urllib.error
from http.server import HTTPServer, SimpleHTTPRequestHandler
from typing import Dict, Any, List, Optional


class EphemeralIPKHandler(SimpleHTTPRequestHandler):
    """Temporary HTTP handler serving a single local IPK file to the TV."""
    file_to_serve = ""

    def do_GET(self):
        if self.path in ("/", "/package.ipk") and self.file_to_serve and os.path.isfile(self.file_to_serve):
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(os.path.getsize(self.file_to_serve)))
            self.send_header("Content-Disposition", "attachment; filename=package.ipk")
            self.end_headers()
            with open(self.file_to_serve, "rb") as f:
                while chunk := f.read(65536):
                    self.wfile.write(chunk)
        else:
            self.send_error(404, "File Not Found")

    def log_message(self, format, *args):
        pass  # Suppress console clutter


class AppManager:
    """Manages webOS application discovery, catalog updates, installation and sideloading."""

    REPO_URL = "https://repo.webosbrew.org/api/apps.json"

    # Master Curated Catalog of verified top-tier webOS homebrew apps (No games/shovelware)
    CURATED_CATALOG = [
        {
            "id": "com.lampa.tv",
            "key": "lampa",
            "title": "Lampa",
            "category": "Online Cinema & Media",
            "desc": "Premier media catalog with online movie cards, actors, trailers, CUB profile sync, 4K HDR playback engine, and TorrServer streaming integration.",
            "root_required": False,
            "latest": "1.4.1",
            "release_date": "2025-10-15",
            "ipk_url": "https://github.com/yumata/lampa/releases/latest",
            "source_url": "https://github.com/yumata/lampa",
            "icon_url": "https://raw.githubusercontent.com/yumata/lampa/main/img/icon.png",
            "changelog": [
                "Enhanced 4K HDR10 and Dolby Vision playback engine",
                "TorrServer MatriX direct stream buffer optimizations",
                "CUB cloud multi-profile synchronization and watch history",
                "Custom parser extensions and online mirror support",
                "Instant Magic Remote cursor and voice search support"
            ]
        },
        {
            "id": "youtube.leanback.v4",
            "key": "youtube_adfree",
            "title": "YouTube AdFree",
            "category": "Ad-Free Streaming",
            "desc": "Native webOS YouTube client with all commercial ads blocked, built-in SponsorBlock segment skipping, and Return YouTube Dislike integration.",
            "root_required": False,
            "latest": "0.5.3",
            "release_date": "2025-06-20",
            "ipk_url": "https://github.com/webosbrew/youtube-webos/releases/download/v0.5.3/youtube.leanback.v4_0.5.3_all.ipk",
            "source_url": "https://github.com/webosbrew/youtube-webos",
            "icon_url": "https://repo.webosbrew.org/apps/icons/youtube.leanback.v4.png",
            "changelog": [
                "Full video ad and banner blocking engine",
                "SponsorBlock v5 integration: auto-skip sponsor segments and intros",
                "Return YouTube Dislike counter restored on video player UI",
                "Automatic 4K VP9/AV1 resolution detection for webOS 4-24",
                "LG analytics and viewing telemetry disabled"
            ]
        },
        {
            "id": "org.webosbrew.hbchannel",
            "key": "hbchannel",
            "title": "Homebrew Channel",
            "category": "Package Store & Root",
            "desc": "Official webOS community package repository client, automated startup daemon manager, elevated system services runner, and SSH/Telnet toggle.",
            "root_required": False,
            "latest": "0.7.3",
            "release_date": "2025-01-11",
            "ipk_url": "https://repo.webosbrew.org/apps/org.webosbrew.hbchannel/releases/d10bf3c753551d7c72fb7a92b20fcd2317e502a220ac668ba8e76f6ea78b363c.ipk",
            "source_url": "https://github.com/webosbrew/webos-homebrew-channel",
            "icon_url": "https://repo.webosbrew.org/apps/icons/org.webosbrew.hbchannel.png",
            "changelog": [
                "webOS 24 (FW 03.30+) compatibility and root preservation",
                "Enhanced failsafe startup hooks and autostart manager",
                "Automated root service privilege elevation",
                "Integrated SSH / Telnet toggle in Settings",
                "OTA software update shield toggle"
            ]
        },
        {
            "id": "org.torrserver.matrix",
            "key": "torrserver",
            "title": "TorrServer Matrix",
            "category": "Torrent Engine",
            "desc": "In-memory BitTorrent streaming server running directly on TV. Plays 50GB-100GB 4K Remux torrents instantly without pre-downloading or flash wear.",
            "root_required": True,
            "latest": "Matrix.133",
            "release_date": "2025-08-10",
            "ipk_url": "https://github.com/YouROK/TorrServer/releases",
            "source_url": "https://github.com/YouROK/TorrServer",
            "icon_url": "https://raw.githubusercontent.com/YouROK/TorrServer/master/web/img/icon.png",
            "changelog": [
                "ARM SoC RAM buffer tuning for high-bitrate 4K torrents",
                "Zero disk writes: streams directly to RAM memory buffers",
                "Multi-peer DHT speed booster and fast tracker announce",
                "Native web UI on TV port 8090 with full settings control",
                "Direct compatibility with Lampa, VoKino, and Kodi"
            ]
        },
        {
            "id": "com.vokino.tv",
            "key": "vokino",
            "title": "VoKino",
            "category": "Online Cinema & Series",
            "desc": "Comprehensive media portal with immense online cinema databases, torrent streaming support, actor filmographies, and 4K HDR playback.",
            "root_required": False,
            "latest": "1.2.6",
            "release_date": "2025-09-05",
            "ipk_url": "https://vokino.tv",
            "source_url": "https://vokino.tv",
            "icon_url": "https://vokino.tv/apple-touch-icon.png",
            "changelog": [
                "Upgraded HTML5 hardware media player for webOS 4-24",
                "TorrServer direct magnet streaming integration",
                "Dolby Vision and HDR10 stream metadata passthrough",
                "Optimized remote control D-Pad and Magic Pointer navigation",
                "Cloud bookmarks and watch position resume"
            ]
        },
        {
            "id": "com.limelight.webos",
            "key": "moonlight",
            "title": "Moonlight TV",
            "category": "PC Game Streaming",
            "desc": "Low-latency 4K 60fps/120fps HDR game streaming from your gaming PC via NVIDIA GameStream or Sunshine. Supports Bluetooth/USB controllers.",
            "root_required": False,
            "latest": "1.6.36",
            "release_date": "2025-04-12",
            "ipk_url": "https://github.com/mariotaku/moonlight-tv/releases/download/v1.6.36/com.limelight.webos_1.6.36_arm.ipk",
            "source_url": "https://github.com/mariotaku/moonlight-tv",
            "icon_url": "https://repo.webosbrew.org/apps/icons/com.limelight.webos.png",
            "changelog": [
                "webOS hardware video decoder acceleration for HEVC and H.264",
                "Ultra low-latency streaming pipeline (sub-10ms decoding)",
                "Full Bluetooth gamepad support (Xbox One/Series, PS4/PS5)",
                "HDR10 streaming color space support",
                "Custom bitrate selector up to 100 Mbps"
            ]
        },
        {
            "id": "org.jellyfin.webos",
            "key": "jellyfin",
            "title": "Jellyfin for webOS",
            "category": "Personal Media Server",
            "desc": "100% free and open-source media client for your personal Jellyfin server. Direct play for 4K MKV, HEVC, AV1, Dolby Vision with zero telemetry.",
            "root_required": False,
            "latest": "1.2.2",
            "release_date": "2025-05-18",
            "ipk_url": "https://github.com/jellyfin/jellyfin-webos/releases/download/v1.2.2/org.jellyfin.webos_1.2.2_all.ipk",
            "source_url": "https://github.com/jellyfin/jellyfin-webos",
            "icon_url": "https://repo.webosbrew.org/apps/icons/org.jellyfin.webos.png",
            "changelog": [
                "DirectPlay ASS/SSA styled anime subtitles engine",
                "Audio passthrough for DTS, Dolby Digital Plus, and TrueHD",
                "WebOS audio track switching without stream reload",
                "Skip Intro button integration for TV series",
                "Enhanced caching for instant library loading"
            ]
        },
        {
            "id": "org.xbmc.kodi",
            "key": "kodi",
            "title": "Kodi for webOS",
            "category": "Complete Media Center",
            "desc": "Full-featured open-source home theater media hub with audio/video add-ons, scrapers, PVR IPTV, and native webOS hardware acceleration.",
            "root_required": False,
            "latest": "21.90.901",
            "release_date": "2025-03-30",
            "ipk_url": "https://mirrors.kodi.tv/releases/webos/org.xbmc.kodi-webos_22.0~rc1.ipk",
            "source_url": "https://github.com/xbmc/xbmc",
            "icon_url": "https://kodi.tv/images/kodi-logo.png",
            "changelog": [
                "Kodi 21 Omega / 22 engine with native webOS platform build",
                "Hardware HEVC 10-bit and AV1 playback pipeline",
                "PVR IPTV Simple Client integrated for live TV playlists",
                "Python 3.12 addon runtime support",
                "LG Magic Remote pointer navigation fix"
            ]
        },
        {
            "id": "twitch.adamffdev.v1",
            "key": "twitch_adfree",
            "title": "Twitch AdFree",
            "category": "Ad-Free Streaming",
            "desc": "Ad-blocking client for Twitch live streams and VODs with BTTV, FFZ, and 7TV animated emotes support, live chat colors, and multi-resolution selection.",
            "root_required": False,
            "latest": "1.6.6",
            "release_date": "2025-07-22",
            "ipk_url": "https://github.com/adamff-dev/twitch-adfree-webos/releases/download/1.6.6/twitch.adamffdev.v1_1.6.6_all.ipk",
            "source_url": "https://github.com/adamff-dev/twitch-webos",
            "icon_url": "https://repo.webosbrew.org/apps/icons/twitch.adamffdev.v1.png",
            "changelog": [
                "Advanced live stream ad-insertion bypass",
                "7TV v3 animated emotes support in live chat",
                "Low-latency streaming mode for real-time streamer interaction",
                "VOD playback with timestamp chapter markers",
                "Twitch user account authorization and follow list sync"
            ]
        },
        {
            "id": "org.webosbrew.piccap",
            "key": "piccap",
            "title": "PicCap - Hyperion Video Grabber",
            "category": "Ambilight & Video Capture",
            "desc": "Hardware-accelerated screen frame grabber for webOS. Captures TV picture and sends frames to Hyperion/HyperHDR for dynamic Ambilight backlighting.",
            "root_required": True,
            "latest": "0.5.3",
            "release_date": "2024-11-04",
            "ipk_url": "https://github.com/TBSniller/piccap/releases/download/0.5.3/org.webosbrew.piccap_0.5.3_all.ipk",
            "source_url": "https://github.com/webosbrew/piccap",
            "icon_url": "https://repo.webosbrew.org/apps/icons/org.webosbrew.piccap.png",
            "changelog": [
                "Hardware video capture backend for webOS 3.5 to webOS 24",
                "DRM-protected picture capture bypass on supported SoCs",
                "Reduced CPU usage by using direct GPU surface blits",
                "UDP and FlatBuffers streaming protocol to Hyperion servers",
                "Auto-pause capture when TV screen is switched off"
            ]
        },
        {
            "id": "org.webosbrew.hyperion.ng.loader",
            "key": "hyperion",
            "title": "Hyperion.NG Loader",
            "category": "Ambilight Engine",
            "desc": "Runs full Hyperion.NG ambilight processing daemon locally on the TV. Controls LED strips connected via USB, Raspberry Pi, WLED, or Philips Hue.",
            "root_required": True,
            "latest": "0.1.11",
            "release_date": "2025-02-14",
            "ipk_url": "https://github.com/webosbrew/hyperion.ng-webos-loader/releases/download/v0.1.11/org.webosbrew.hyperion.ng.loader_0.1.11_all.ipk",
            "source_url": "https://github.com/webosbrew/hyperion.ng-webos-loader",
            "icon_url": "https://repo.webosbrew.org/apps/icons/org.webosbrew.hyperion.ng.loader.png",
            "changelog": [
                "Local WLED and Philips Hue UDP controller integration",
                "Embedded web management dashboard on port 8099",
                "Multi-zone color smoothing and dynamic black border detection",
                "Automated background daemon startup on TV power on"
            ]
        },
        {
            "id": "org.webosbrew.hyperhdr.loader",
            "key": "hyperhdr",
            "title": "HyperHDR Loader",
            "category": "Ambilight Engine",
            "desc": "High-performance Ambilight controller optimized for HDR10 and Dolby Vision tone-mapping and ultra-low latency LED synchronization.",
            "root_required": True,
            "latest": "22.0.1",
            "release_date": "2025-04-01",
            "ipk_url": "https://github.com/webosbrew/hyperhdr-webos-loader/releases/download/v22.0.1/org.webosbrew.hyperhdr.loader_22.0.1_all.ipk",
            "source_url": "https://github.com/webosbrew/hyperhdr-webos-loader",
            "icon_url": "https://repo.webosbrew.org/apps/icons/org.webosbrew.hyperhdr.loader.png",
            "changelog": [
                "Real-time HDR10 and Dolby Vision LUT tone-mapping engine",
                "Multi-threaded frame processing for smooth 60fps LEDs",
                "Direct USB serial LED controller support",
                "Integrated web configuration UI"
            ]
        },
        {
            "id": "org.webosbrew.kinopub",
            "key": "kinopub",
            "title": "KinoPub",
            "category": "Subscription Cinema",
            "desc": "Dedicated streaming client for KinoPub service with 4K HDR, Dolby Atmos audio tracks, multilanguage subtitles, and watch history synchronization.",
            "root_required": False,
            "latest": "1.7.0",
            "release_date": "2025-05-10",
            "ipk_url": "https://kino.pub",
            "source_url": "https://kino.pub",
            "icon_url": "https://kino.pub/favicon.ico",
            "changelog": [
                "HLS direct streaming with multi-bitrate selection",
                "Dolby Atmos and 5.1 AC3 multichannel audio passthrough",
                "Bookmarks and personal playlist synchronization",
                "Voice search and fast playback scrubbing"
            ]
        },
        {
            "id": "com.msx.app",
            "key": "msx",
            "title": "Media Station X",
            "category": "Multi-Media Portal",
            "desc": "Universal media platform launcher for webOS. Runs community portals (ForkPlayer, VPlay, Lampa, etc.) via start-parameter links.",
            "root_required": False,
            "latest": "1.4.2",
            "release_date": "2024-12-15",
            "ipk_url": "https://msx.benzac.de",
            "source_url": "https://msx.benzac.de",
            "icon_url": "https://msx.benzac.de/favicon.ico",
            "changelog": [
                "Upgraded HTML5 video buffer engine",
                "Remote control navigation and custom skin support",
                "Community playlist launcher and start parameter links"
            ]
        },
        {
            "id": "ooo.lew.lifesgoodwithoutspying",
            "key": "no_spying",
            "title": "Life's Good Without Spying",
            "category": "Privacy & Telemetry Blocker",
            "desc": "Automatically redirects and blocks all LG telemetry, ad tracking, viewing habits logs, and ACR (Automatic Content Recognition) spying domains via local hosts file.",
            "root_required": True,
            "latest": "0.6.0",
            "release_date": "2025-01-20",
            "ipk_url": "https://github.com/lewisdoesstuff/lifesgoodwithoutspying/releases/latest/download/ooo.lew.lifesgoodwithoutspying.ipk",
            "source_url": "https://github.com/webosbrew/lifesgoodwithoutspying",
            "icon_url": "https://repo.webosbrew.org/apps/icons/ooo.lew.lifesgoodwithoutspying.png",
            "changelog": [
                "Comprehensive 2025/2026 LG ad and telemetry domains blocklist",
                "Blocks Home Screen banner ad injection servers",
                "Eliminates ACR background screen fingerprinting logs",
                "Zero latency impact on video playback and streaming services"
            ]
        },
        {
            "id": "com.github.cfernande1470.wireguard",
            "key": "wireguard",
            "title": "WireGuard VPN",
            "category": "Network & VPN",
            "desc": "High-speed WireGuard VPN client running directly inside webOS. Routes TV internet traffic through secure encrypted VPN tunnels with zero lag.",
            "root_required": True,
            "latest": "1.0.7",
            "release_date": "2024-10-28",
            "ipk_url": "https://github.com/RodriguezCF/webos-wireguard/releases/download/v1.0.7/com.github.cfernande1470.wireguard_1.0.7_all.ipk",
            "source_url": "https://github.com/cfernande1470/webos-wireguard",
            "icon_url": "https://repo.webosbrew.org/apps/icons/com.github.cfernande1470.wireguard.png",
            "changelog": [
                "Kernel WireGuard module integration for maximum throughput",
                "Direct import of custom .conf VPN profile configurations",
                "Auto-reconnect on TV power on or Wi-Fi wake",
                "DNS leak protection and custom resolver support"
            ]
        },
        {
            "id": "com.open.hidden.menu",
            "key": "hidden_menu",
            "title": "Open Service Menu",
            "category": "Service & Diagnostics",
            "desc": "Opens the secret LG TV In-Start and EZ-Adjust service menus directly without requiring a special service remote control.",
            "root_required": False,
            "latest": "1.5.1",
            "release_date": "2025-02-08",
            "ipk_url": "https://github.com/Kzuismee/Open-Service-Menu/releases/download/1.5.1/com.open.hidden.menu_1.5.1_all.ipk",
            "source_url": "https://github.com/webosbrew/open-hidden-menu",
            "icon_url": "https://repo.webosbrew.org/apps/icons/com.open.hidden.menu.png",
            "changelog": [
                "Direct launch of In-Start and EZ-Adjust menus via Luna bus",
                "Support for webOS 3.5 through webOS 24",
                "Built-in PIN prompt trigger for standard 0413 service code"
            ]
        },
        {
            "id": "com.retroarch.webos",
            "key": "retroarch",
            "title": "RetroArch",
            "category": "Retro Gaming",
            "desc": "Universal retro games emulator frontend for NES, SNES, Genesis, PlayStation 1, GBA, and Arcade. Full USB/Bluetooth controller support.",
            "root_required": False,
            "latest": "1.22.2",
            "release_date": "2025-03-15",
            "ipk_url": "https://github.com/webosbrew/RetroArch/releases/download/v1.22.2/com.retroarch.webos_1.22.2_arm.ipk",
            "source_url": "https://github.com/libretro/RetroArch",
            "icon_url": "https://repo.webosbrew.org/apps/icons/com.retroarch.webos.png",
            "changelog": [
                "SDL2 hardware OpenGL rendering pipeline",
                "USB and Bluetooth gamepad rumble / vibration support",
                "Quick Save and Load state hotkeys for physical remotes",
                "CRT and Scanline shader presets for vintage TVs"
            ]
        },
        {
            "id": "com.github.gprot42.webosterminal",
            "key": "terminal",
            "title": "webOS Terminal",
            "category": "System Utility",
            "desc": "On-screen bash/sh terminal emulator right on the TV display with virtual on-screen keyboard or physical USB keyboard.",
            "root_required": True,
            "latest": "0.0.13",
            "release_date": "2024-09-19",
            "ipk_url": "https://github.com/gprot42/webos-terminal/releases/download/v0.0.13/com.github.gprot42.webosterminal_0.0.13_all.ipk",
            "source_url": "https://github.com/gprot42/webos-terminal",
            "icon_url": "https://repo.webosbrew.org/apps/icons/com.github.gprot42.webosterminal.png",
            "changelog": [
                "ANSI 256-color support with customizable font sizes",
                "Root shell privilege elevation",
                "Physical USB keyboard auto-detection and clipboard paste"
            ]
        },
        {
            "id": "org.webosbrew.vncserver",
            "key": "vncserver",
            "title": "VNC Server",
            "category": "Remote Control",
            "desc": "Remote desktop VNC server running on TV. Allows viewing TV display and controlling cursor/remote from any PC, phone, or tablet.",
            "root_required": True,
            "latest": "1.0.3",
            "release_date": "2024-06-11",
            "ipk_url": "https://github.com/Informatic/webos-vncserver/releases/download/v1.0.3/org.webosbrew.vncserver_1.0.3_all.ipk",
            "source_url": "https://github.com/webosbrew/webos-vncserver",
            "icon_url": "https://repo.webosbrew.org/apps/icons/org.webosbrew.vncserver.png",
            "changelog": [
                "Direct hardware framebuffer capture at 30/60fps",
                "Mouse pointer and virtual keyboard keystroke injection",
                "Password authentication and configurable listening port"
            ]
        }
    ]

    _cached_catalog: Optional[List[Dict[str, Any]]] = None
    _last_sync_time: float = 0.0

    @classmethod
    def get_catalog(cls, refresh_online: bool = False) -> List[Dict[str, Any]]:
        """Returns the curated catalog, merging with online repo if requested or not yet cached."""
        if cls._cached_catalog is not None and not refresh_online:
            return cls._cached_catalog

        catalog = [dict(app) for app in cls.CURATED_CATALOG]

        # Fetch online packages from official webosbrew repo only when explicitly requested
        if refresh_online:
            try:
                req = urllib.request.Request(cls.REPO_URL, headers={"User-Agent": "lg-webos-toolbox/1.0"})
                with urllib.request.urlopen(req, timeout=2.5) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    pkgs = data.get("packages", [])
                    pkg_map = {p.get("id"): p for p in pkgs}

                    for item in catalog:
                        pkg = pkg_map.get(item["id"])
                        if pkg:
                            manifest = pkg.get("manifest") or {}
                            online_ver = manifest.get("version")
                            if online_ver:
                                item["latest"] = online_ver
                            if manifest.get("ipkUrl"):
                                item["ipk_url"] = manifest.get("ipkUrl")
                            if manifest.get("sourceUrl"):
                                item["source_url"] = manifest.get("sourceUrl")
                            if manifest.get("iconUri"):
                                item["icon_url"] = manifest.get("iconUri")
                            if manifest.get("appDescription") and len(manifest["appDescription"]) > 10:
                                item["desc"] = manifest["appDescription"]

                cls._last_sync_time = time.time()
            except Exception:
                pass  # Fallback smoothly to curated catalog

        cls._cached_catalog = catalog
        return catalog

    @classmethod
    def inspect_device_apps(cls, client) -> Dict[str, Any]:
        """
        Inspects all applications currently on the TV.
        Compares against catalog for version detection and lists all user apps for uninstallation.
        """
        if not client:
            return {"connected": False, "catalog": [], "installed_apps": [], "counts": {}}

        # Query installed apps via Luna Bus
        res = client.luna_send("com.webos.applicationManager/listApps", {})
        raw_apps = res.get("apps", [])
        installed_map = {a.get("id"): a for a in raw_apps}

        catalog = cls.get_catalog()
        catalog_results = []
        installed_user_apps = []

        updates_available_count = 0
        installed_catalog_count = 0

        for cat in catalog:
            app_id = cat["id"]
            installed = installed_map.get(app_id)

            item = dict(cat)
            if installed:
                cur_v = str(installed.get("version", "1.0.0"))
                latest_v = str(cat["latest"])
                folder = installed.get("folderPath", "")

                is_sideloaded = "/media/developer/apps" in folder
                is_store = "/media/cryptofs/apps" in folder or not is_sideloaded

                # Simple semver/string version comparison
                is_up_to_date = (cur_v == latest_v)
                update_available = (cur_v != latest_v and cur_v < latest_v)

                if update_available:
                    updates_available_count += 1
                installed_catalog_count += 1

                item.update({
                    "installed": True,
                    "version": cur_v,
                    "is_up_to_date": is_up_to_date,
                    "update_available": update_available,
                    "folder": folder,
                    "origin": "Sideloaded (DevMode/Root)" if is_sideloaded else "LG Content Store",
                    "status_badge": f"v{cur_v} • Up to Date" if is_up_to_date else f"Update: v{cur_v} -> v{latest_v}",
                    "status_type": "online" if is_up_to_date else "warning",
                    "action_label": "Launch on TV" if is_up_to_date else "Update App"
                })
            else:
                item.update({
                    "installed": False,
                    "version": None,
                    "is_up_to_date": False,
                    "update_available": False,
                    "origin": "Not Installed",
                    "status_badge": "○ Not Installed",
                    "status_type": "offline",
                    "action_label": "Install App"
                })

            catalog_results.append(item)

        # Build comprehensive list of all installed user/removable packages on TV
        for a in raw_apps:
            app_id = a.get("id", "")
            title = a.get("title", app_id)
            ver = a.get("version", "1.0")
            removable = a.get("removable", False)
            system_app = a.get("systemApp", False)
            folder = a.get("folderPath", "")

            # Filter out non-removable core system daemons
            if system_app and not removable:
                continue

            is_sideloaded = "/media/developer/apps" in folder
            is_store = "/media/cryptofs/apps" in folder

            origin_str = "Sideloaded (Homebrew)" if is_sideloaded else ("LG Content Store" if is_store else "System/Preinstalled")

            # Check if this app exists in our curated catalog
            in_catalog = any(c["id"] == app_id for c in catalog)

            installed_user_apps.append({
                "id": app_id,
                "title": title,
                "version": ver,
                "vendor": a.get("vendor", "LG App"),
                "folder": folder,
                "removable": removable,
                "origin": origin_str,
                "in_catalog": in_catalog
            })

        # Sort user apps alphabetically by title
        installed_user_apps.sort(key=lambda x: x["title"].lower())

        return {
            "connected": True,
            "catalog": catalog_results,
            "installed_apps": installed_user_apps,
            "counts": {
                "total_catalog": len(catalog_results),
                "installed_catalog": installed_catalog_count,
                "updates_available": updates_available_count,
                "total_installed_user": len(installed_user_apps)
            }
        }

    @classmethod
    def install_app(cls, client, app_id: str, ipk_url: Optional[str] = None) -> Dict[str, Any]:
        """
        Installs an application by downloading the .ipk to the TV and invoking Luna Bus / opkg.
        """
        if not client:
            return {"success": False, "error": "Not connected to TV."}

        # Resolve IPK download URL if not provided directly
        if not ipk_url:
            catalog = cls.get_catalog()
            for item in catalog:
                if item["id"] == app_id:
                    ipk_url = item.get("ipk_url")
                    break

        if not ipk_url or not ipk_url.startswith("http"):
            return {"success": False, "error": f"No valid download URL available for {app_id}."}

        # 1. First attempt native Homebrew Channel install service if registered and active
        try:
            hb_res = client.luna_send("org.webosbrew.hbchannel.service/install", {
                "id": app_id,
                "ipkUrl": ipk_url
            })
            if hb_res.get("returnValue") or hb_res.get("finished"):
                return {"success": True, "message": f"{app_id} installed successfully via Homebrew Channel."}
        except Exception:
            pass

        # 2. Universal direct TV download and install via curl & luna-send / opkg
        tmp_ipk = f"/tmp/pkg_{int(time.time())}.ipk"
        dl_cmd = f"curl -k -L -s -o '{tmp_ipk}' '{ipk_url}'"
        client.execute_shell(dl_cmd, timeout=30.0)

        # Verify file downloaded and is non-empty
        check_size = client.execute_shell(f"wc -c < '{tmp_ipk}' 2>/dev/null", timeout=2.0).strip()
        if not check_size.isdigit() or int(check_size) < 1000:
            client.execute_shell(f"rm -f '{tmp_ipk}'", timeout=1.0)
            return {"success": False, "error": f"Failed to download package from {ipk_url}."}

        # Install via Luna Bus appInstallService
        install_res = client.luna_send("com.webos.appInstallService/dev/install", {
            "id": app_id,
            "ipkUrl": tmp_ipk,
            "subscribe": True
        })

        # Fallback to opkg if rooted and luna call was not immediately acknowledged
        if not install_res.get("returnValue"):
            opkg_res = client.execute_shell(f"opkg install '{tmp_ipk}' 2>&1", timeout=15.0)
            if "Configuring" not in opkg_res and "Installing" not in opkg_res:
                client.execute_shell(f"rm -f '{tmp_ipk}'", timeout=1.0)
                return {"success": False, "error": f"Package installation failed: {opkg_res}"}

        # Clean up temporary file
        client.execute_shell(f"rm -f '{tmp_ipk}'", timeout=1.0)
        return {"success": True, "message": f"{app_id} installed and registered successfully."}

    @classmethod
    def uninstall_app(cls, client, app_id: str) -> Dict[str, Any]:
        """
        Uninstalls an application from PC in 1 click via Luna Bus and cleans up remnants.
        Handles both LG Content Store packages and sideloaded packages.
        """
        if not client:
            return {"success": False, "error": "Not connected to TV."}

        # 1. Call dev/remove (for sideloaded packages)
        client.luna_send("com.webos.appInstallService/dev/remove", {"id": app_id})

        # 2. Call standard remove (for Content Store & system packages)
        client.luna_send("com.webos.appInstallService/remove", {"id": app_id})

        # 3. If Homebrew Channel service exists, call it as well
        try:
            client.luna_send("org.webosbrew.hbchannel.service/uninstall", {"id": app_id})
        except Exception:
            pass

        # 4. Clean up any remaining directories on flash if rooted
        client.execute_shell(f"rm -rf /media/developer/apps/usr/palm/applications/{app_id} 2>/dev/null", timeout=1.5)
        client.execute_shell(f"rm -rf /media/developer/apps/usr/palm/services/{app_id}* 2>/dev/null", timeout=1.5)

        return {"success": True, "message": f"Application '{app_id}' uninstalled successfully from TV."}

    @classmethod
    def sideload_local_ipk(cls, client, local_ipk_path: str) -> Dict[str, Any]:
        """
        Transfers a local .ipk file from PC to TV via a transient HTTP server and installs it.
        """
        if not client:
            return {"success": False, "error": "Not connected to TV."}

        if not os.path.isfile(local_ipk_path):
            return {"success": False, "error": f"File does not exist: {local_ipk_path}"}

        # Determine PC local IP reachable by TV
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect((client.ip, 80))
            pc_ip = s.getsockname()[0]
            s.close()
        except Exception as e:
            return {"success": False, "error": f"Unable to determine local PC network IP: {e}"}

        # Pick random available port
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as temp_s:
            temp_s.bind(('', 0))
            port = temp_s.getsockname()[1]

        EphemeralIPKHandler.file_to_serve = local_ipk_path
        server = HTTPServer(('0.0.0.0', port), EphemeralIPKHandler)

        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()

        try:
            package_url = f"http://{pc_ip}:{port}/package.ipk"
            tmp_tv_path = f"/tmp/local_sideload_{int(time.time())}.ipk"

            # TV downloads package from PC
            dl_cmd = f"curl -k -s -o '{tmp_tv_path}' '{package_url}'"
            client.execute_shell(dl_cmd, timeout=20.0)

            # Check downloaded file size
            check_size = client.execute_shell(f"wc -c < '{tmp_tv_path}' 2>/dev/null", timeout=2.0).strip()
            if not check_size.isdigit() or int(check_size) < 100:
                return {"success": False, "error": "Failed to transfer IPK package to TV."}

            # Install via Luna Bus
            install_res = client.luna_send("com.webos.appInstallService/dev/install", {
                "id": "user_sideload",
                "ipkUrl": tmp_tv_path,
                "subscribe": True
            })

            # If not returnValue, try opkg
            if not install_res.get("returnValue"):
                opkg_out = client.execute_shell(f"opkg install '{tmp_tv_path}' 2>&1", timeout=15.0)
                if "Configuring" not in opkg_out and "Installing" not in opkg_out:
                    return {"success": False, "error": f"Installation error: {opkg_out}"}

            # Clean up
            client.execute_shell(f"rm -f '{tmp_tv_path}'", timeout=1.0)
            return {"success": True, "message": f"Local package '{os.path.basename(local_ipk_path)}' installed successfully!"}
        finally:
            server.shutdown()
            server.server_close()
