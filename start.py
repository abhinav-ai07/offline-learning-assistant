"""One-command runner for Offline Intelligent Learning Assistant (ILA).

Usage:
    python start.py
    (or double-click start.bat)

Port-conflict behaviour
-----------------------
* If port 8765 is already occupied and the occupying process is a healthy ILA
  server, the script reuses it (opens the browser) and exits cleanly.
* If the port is occupied by an *unrelated* process, the script prints the PID,
  explains the conflict, and exits without starting a second server.
* Only when the port is free does the script actually launch uvicorn.
* The browser is opened only after a confirmed HTTP /api/health response.
"""

from __future__ import annotations

import os
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DASHBOARD_DIST = ROOT / "dashboard" / "dist" / "index.html"
HOST = "127.0.0.1"
PORT = 8765
URL = f"http://{HOST}:{PORT}"
HEALTH_URL = f"{URL}/api/health"

BANNER = f"""
{'=' * 72}
   OFFLINE INTELLIGENT LEARNING ASSISTANT  (ILA)
   Unified Server: FastAPI backend + Classroom Dashboard
   URL : {URL}
{'=' * 72}
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _port_in_use() -> bool:
    """Return True if something is already listening on PORT."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        if s.connect_ex((HOST, PORT)) == 0:
            return True
    # Fallback bind check catches listeners on 0.0.0.0 or restricted loopback
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            s.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        try:
            s.bind((HOST, PORT))
            return False
        except OSError:
            return True


def _ila_health_check(timeout: float = 2.0) -> bool:
    """Return True if /api/health replies with status=ok."""
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=timeout) as resp:
            import json
            body = json.loads(resp.read())
            if body.get("status") != "ok":
                return False
        with urllib.request.urlopen(f"{URL}/admin/login", timeout=timeout) as page:
            if page.headers.get_content_type() != "text/html":
                return False
        try:
            urllib.request.urlopen(f"{URL}/api/admin/school", timeout=timeout).close()
        except urllib.error.HTTPError as exc:
            return exc.code == 401
        return False
    except Exception:
        return False


def _pid_on_port() -> int | None:
    """Return the PID of the process listening on PORT (Windows only)."""
    try:
        output = subprocess.check_output(
            ["netstat", "-ano", "-p", "TCP"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
        for line in output.splitlines():
            if f":{PORT}" in line and "LISTENING" in line:
                parts = line.split()
                if parts:
                    return int(parts[-1])
    except Exception:
        pass
    return None


def _wait_for_ila(max_wait: float = 30.0, interval: float = 0.5) -> bool:
    """Poll /api/health until ILA responds or we time out."""
    deadline = time.monotonic() + max_wait
    dots = 0
    while time.monotonic() < deadline:
        if _ila_health_check(timeout=interval):
            return True
        time.sleep(interval)
        dots += 1
        if dots % 4 == 0:
            print(".", end="", flush=True)
    return False


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def _resolve_ila_home() -> Path:
    """Keep existing user data/models in ~/.ila if present; otherwise use repo-local .ila."""
    existing_env = os.environ.get("ILA_HOME")
    if existing_env:
        return Path(existing_env).expanduser()
    user_ila = Path.home() / ".ila"
    if (user_ila / "data" / "ila.sqlite3").is_file():
        return user_ila
    return ROOT / ".ila"


def _dashboard_needs_build() -> bool:
    """Return True if dashboard/dist is missing or older than dashboard/src."""
    if not DASHBOARD_DIST.is_file():
        return True
    src_dir = ROOT / "dashboard" / "src"
    if not (ROOT / "dashboard" / "node_modules").is_dir() or not src_dir.is_dir():
        return False
    dist_mtime = DASHBOARD_DIST.stat().st_mtime
    for candidate in [ROOT / "dashboard" / "index.html", *src_dir.rglob("*")]:
        if candidate.is_file() and candidate.stat().st_mtime > dist_mtime:
            return True
    return False


def _served_index_matches_dist(timeout: float = 2.0) -> bool:
    """Check whether the running ILA server is already serving our current dashboard/dist."""
    if not DASHBOARD_DIST.is_file():
        return True
    try:
        dist_html = DASHBOARD_DIST.read_text(encoding="utf-8")
        import re
        match = re.search(r'/assets/(index-[A-Za-z0-9_-]+\.js)', dist_html)
        if not match:
            return True
        expected_asset = match.group(1)
        with urllib.request.urlopen(f"{URL}/", timeout=timeout) as resp:
            live_html = resp.read().decode("utf-8", errors="ignore")
        return expected_asset in live_html
    except Exception:
        return False


def _stop_pid_tree(pid: int) -> None:
    """Terminate an older ILA server process tree cleanly so the updated build can bind PORT."""
    try:
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    except Exception:
        pass


def main() -> None:
    os.chdir(ROOT)
    ila_home = _resolve_ila_home()
    os.environ["ILA_HOME"] = str(ila_home)

    if "--create-admin" in sys.argv:
        from ila.cli import create_admin
        create_admin()
        return

    print(BANNER)
    print(f"[i] Data & models directory: {ila_home}\n")

    # 1. Build/refresh dashboard dist if missing or out-of-date ---------------
    if _dashboard_needs_build():
        print("[*] Building dashboard (npm run build)...")
        dashboard_dir = ROOT / "dashboard"
        try:
            subprocess.run(
                ["npm", "run", "build"],
                cwd=dashboard_dir,
                check=True,
                shell=True,
            )
            print("[✓] Dashboard built successfully.")
        except Exception as exc:
            print(
                f"[!] Warning: Could not auto-build dashboard ({exc}).\n"
                "    Run  cd dashboard && npm run build  manually if the UI looks broken."
            )

    # 2. Check if the port is already occupied --------------------------------
    if _port_in_use():
        print(f"[i] Port {PORT} is already in use.")

        if _ila_health_check():
            if _served_index_matches_dist():
                print(f"[✓] Up-to-date ILA server is already running at {URL}")
                print("    Opening browser...")
                webbrowser.open(URL)
                print("\n    To stop the existing server, press Ctrl+C in its terminal window.")
                return
            pid = _pid_on_port()
            if pid:
                print(f"[*] Replacing older ILA server (PID {pid}) with updated build...")
                _stop_pid_tree(pid)
                for _ in range(20):
                    if not _port_in_use():
                        break
                    time.sleep(0.25)

        if _port_in_use():
            # Port occupied by something else
            pid = _pid_on_port()
            pid_msg = f" (PID {pid})" if pid else ""
            print(f"\n[✗] ERROR: Port {PORT} is occupied by another process{pid_msg}.")
            print(    "    The listener did not pass the Administration Portal readiness check.")
            print(    "\n    Options:")
            if pid:
                print(f"      • If this is an older ILA server, stop its terminal with Ctrl+C and restart this launcher.")
            print(    "      • Use a different port by editing HOST/PORT in start.py.")
            print(    "      • Restart your computer if the process is a stale socket.\n")
            sys.exit(1)

    if sys.stdin.isatty():
        from ila.storage import Storage
        school = Storage(ila_home / "data" / "ila.sqlite3")
        if not school.count_users("admin"):
            from ila.cli import create_admin
            print("First launch: create the school administrator account.")
            create_admin()

    # 3. Determine Python executable ------------------------------------------
    python_exe = sys.executable
    venv_python = ROOT / ".venv" / "Scripts" / "python.exe"
    if venv_python.is_file():
        python_exe = str(venv_python)

    print(f"[*] Starting ILA server on {HOST}:{PORT} (with live code reload & real-time sync)...")
    print("    Press Ctrl+C to stop.\n")

    # 4. Launch uvicorn in a subprocess so we can monitor it ------------------
    env = {**os.environ, "PYTHONUNBUFFERED": "1", "ILA_HOME": str(ila_home)}
    try:
        server_proc = subprocess.Popen(
            [
                python_exe, "-m", "uvicorn",
                "ila.server:app",
                "--host", HOST,
                "--port", str(PORT),
                "--reload",
                "--reload-dir", "src",
                "--log-level", "info",
            ],
            env=env,
        )
    except FileNotFoundError:
        print("[✗] Could not locate uvicorn. Is the virtual environment activated?")
        sys.exit(1)

    # 5. Wait for ILA to respond to /api/health before opening the browser ----
    print("[*] Waiting for server to become ready", end="", flush=True)
    ready = _wait_for_ila(max_wait=40.0)
    print()  # newline after dots

    if not ready:
        print(
            "\n[✗] Server did not become healthy within the expected time.\n"
            "    Check the logs above for errors (e.g. import errors, missing deps)."
        )
        server_proc.terminate()
        sys.exit(1)

    print(f"\n[SUCCESS] ILA server is ready! Opening {URL} in your browser...\n")
    webbrowser.open(URL)

    # 6. Wait for Ctrl+C, then shut down cleanly ------------------------------
    try:
        server_proc.wait()
    except KeyboardInterrupt:
        print("\n[*] Ctrl+C received — shutting down ILA server...")
        try:
            server_proc.send_signal(signal.CTRL_C_EVENT)
        except Exception:
            server_proc.terminate()
        try:
            server_proc.wait(timeout=5)
        except Exception:
            server_proc.kill()
        print("[✓] Server stopped.")


if __name__ == "__main__":
    main()
