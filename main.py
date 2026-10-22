#!/usr/bin/env python3
"""
webOS Toolbox
Desktop utility for LG webOS diagnostics, root assistant, interactive shell & performance optimization.
"""

import sys
import os
import time
import threading
import ctypes
import webview

# Add project root to sys.path
# PyInstaller frozen bundle support
if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
    BASE_DIR = sys._MEIPASS
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

sys.path.insert(0, BASE_DIR)

# Set Windows AppUserModelID so the taskbar groups this window under its own name & icon
try:
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("lg.webos.toolbox.desktop")
except Exception:
    pass

from ui.bridge import BridgeApi

def apply_native_window_icon(window):
    """Sets the custom icon on Windows taskbar and titlebar asynchronously without blocking UI pump."""
    def _worker():
        time.sleep(0.4)
        try:
            icon_path = os.path.join(BASE_DIR, "ui", "web", "assets", "icon.ico")
            if not os.path.exists(icon_path):
                return

            hwnd = ctypes.windll.user32.FindWindowW(None, "webOS Toolbox")
            if hwnd:
                # 1 = IMAGE_ICON, 0x10 = LR_LOADFROMFILE
                h_icon_big = ctypes.windll.user32.LoadImageW(None, icon_path, 1, 32, 32, 0x10)
                h_icon_small = ctypes.windll.user32.LoadImageW(None, icon_path, 1, 16, 16, 0x10)
                # PostMessageW is non-blocking and prevents message loop deadlocks
                if h_icon_big:
                    ctypes.windll.user32.PostMessageW(hwnd, 0x0080, 1, h_icon_big)
                if h_icon_small:
                    ctypes.windll.user32.PostMessageW(hwnd, 0x0080, 0, h_icon_small)
        except Exception:
            pass

    threading.Thread(target=_worker, daemon=True).start()

def main():
    api = BridgeApi()
    html_file = os.path.join(BASE_DIR, "ui", "web", "index.html")

    window = webview.create_window(
        title="webOS Toolbox",
        url=html_file,
        js_api=api,
        width=1080,
        height=760,
        min_size=(1080, 750),
        background_color="#09090b"
    )
    api._window = window
    window.events.shown += lambda: apply_native_window_icon(window)
    webview.start(debug=False)

if __name__ == "__main__":
    main()
