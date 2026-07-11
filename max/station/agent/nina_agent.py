#!/usr/bin/env python3
"""
Borean Astro Personal Edition — NINA polling agent.

Set BOREAN_HUB_BASE_URL (default http://127.0.0.1:7841) via Station Agent UI or env.
Optional: IMAGING_QUEUE_SECRET, R2_* when output mode requires upload.
"""


from __future__ import annotations

import hashlib
import base64
import json
import queue
import subprocess
import sys
import threading
import time
import traceback
import zipfile
import os
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse
from typing import Dict, Optional

from borean_http import ssl_ca_status, urlopen as borean_urlopen

try:
    import boto3
except ImportError:
    boto3 = None

try:
    from PIL import Image, ImageOps
except ImportError:
    Image = None
    ImageOps = None

try:
    import numpy as np
except ImportError:
    np = None

try:
    from astropy.io import fits
except ImportError:
    fits = None

if Image is not None:
    try:
        RESAMPLE_LANCZOS = Image.Resampling.LANCZOS  # Pillow >= 9
    except AttributeError:
        RESAMPLE_LANCZOS = Image.LANCZOS
else:
    RESAMPLE_LANCZOS = None


# =========================
# CONFIG (Personal Hub — override via env from Station Agent)
# =========================
def _api_base_url() -> str:
    raw = os.environ.get(
        "BOREAN_API_BASE_URL",
        os.environ.get("BOREAN_HUB_BASE_URL", "http://127.0.0.1:7841"),
    ).strip()
    return raw.rstrip("/")


def _tenant_id() -> str:
    return os.environ.get("BOREAN_TENANT_ID", "dev-local").strip() or "dev-local"


def _api_url(path: str) -> str:
    suffix = path if path.startswith("/") else f"/{path}"
    return f"{_api_base_url()}/api/personal/{_tenant_id()}{suffix}"


SEQUENCE_JSON_URL = _api_url("/imaging/nina-sequence")
RECONCILE_QUEUE_URL = _api_url("/imaging/reconcile-queue-schedule")
AGENT_PULSE_URL = _api_url("/imaging/agent-pulse")
ESTOP_DELIVERY_URL = _api_url("/imaging/emergency-stop/delivery")
AGENT_EVENTS_URL = _api_url("/imaging/agent-events")
# Vercel Hobby cannot run sub-daily crons; agent used to trigger reconcile on poll cadence.
# Reconcile is now pushed via agent-events SSE (or fallback poll below).
RECONCILE_EVERY_N_POLLS = 0
# Optional override. Otherwise: env BOREAN_CRON_SECRET (same as Vercel CRON_SECRET), then TOKEN.
RECONCILE_BEARER = ""

# Optional bearer for nina-sequence / uploads. Required for production www.boreanastro.com URLs.
TOKEN = ""

POLL_SECONDS = 45
FALLBACK_POLL_SECONDS = 300
SSE_CONNECTED_WAIT_SECONDS = 60
AGENT_USER_AGENT = os.environ.get(
    "BOREAN_AGENT_USER_AGENT",
    "Borean Astro Station Agent/1.0 (Windows; NINA)",
)
LOCAL_HUB_URL = "http://127.0.0.1:7841"
JOBS_DIR = os.environ.get(
    "BOREAN_JOBS_DIR",
    str(Path.home() / "Downloads" / "NinaJobs"),
)
LOCAL_SEQUENCE_FILENAME = "latest_sequence.json"
NINA_INSTALL_DIR = os.environ.get(
    "BOREAN_NINA_INSTALL_DIR",
    r"C:\Program Files\N.I.N.A. - Nighttime Imaging 'N' Astronomy",
)

# Optional args, for example:
# NINA_EXTRA_ARGS = ["--profileid", "YOUR_PROFILE_GUID", "--exitaftersequence"]
NINA_EXTRA_ARGS: list[str] = ["--exitaftersequence"]

# If True, do not start a new job when NINA.exe is already running.
SKIP_WHEN_NINA_RUNNING = True

# Poll interval while waiting for started NINA process to exit.
RUNNING_CHECK_SECONDS = 15
RUNNING_PULSE_INTERVAL_SECONDS = 30
# While NINA is running, poll for Emergency STOP sequence at this interval.
ESTOP_POLL_SECONDS = 5

# NINA image output root folder (scan recursively after each run).
NINA_OUTPUT_DIR = os.environ.get(
    "BOREAN_NINA_OUTPUT_DIR",
    str(Path.home() / "Documents" / "N.I.N.A"),
)

# Upload image and common processing outputs.
UPLOAD_EXTENSIONS = {
    ".fits",
    ".fit",
    ".xisf",
    ".tif",
    ".tiff",
    ".jpg",
    ".jpeg",
    ".png",
}

# Candidate keys used to map files to one observing session.
SESSION_ID_KEYS = ("sessionId", "session_id", "sessionID")
OUTPUT_MODE_RAW_ZIP = "raw_zip"
OUTPUT_MODE_NONE = "none"

# -------- R2 upload config (optional, but recommended) --------
# Install dependency on observatory PC once: pip install boto3
# Credentials: Windows env R2_* (same values as Vercel). Never commit secrets here.
# Personal: R2/PDU off unless explicitly enabled in Station settings / env.
R2_ENABLED = os.environ.get("PERSONAL_R2_ENABLED", "0").strip() in ("1", "true", "yes")
R2_ACCOUNT_ID = ""
R2_ACCESS_KEY_ID = ""
R2_SECRET_ACCESS_KEY = ""
R2_BUCKET = ""
R2_PUBLIC_BASE_URL = ""  # e.g. "https://files.YOUR_DOMAIN"
R2_PREFIX = "imaging"

# Notify backend after each upload batch so website can map queueId -> objectKey.
# Backend endpoint: POST /api/imaging/session-files
# Uses Authorization header from TOKEN (Bearer) if TOKEN is set.
UPLOAD_REPORT_URL = _api_url("/imaging/session-files")

# -------- Live preview config (scheme A) --------
# Generate/upload one latest JPEG preview for each session when possible.
PREVIEW_ENABLED = True
PREVIEW_MAX_WIDTH = 1280
PREVIEW_JPEG_QUALITY = 72
PREVIEW_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".fit", ".fits"}
# API receives latest preview and keeps it until replaced.
PREVIEW_UPLOAD_URL = _api_url("/imaging/preview")

# -------- Digital Loggers PDU (mount + camera power) --------
# Credentials: Windows env PDU_USER, PDU_PASSWORD (never commit secrets).
PDU_ENABLED = os.environ.get("PERSONAL_PDU_ENABLED", "0").strip() in ("1", "true", "yes")
PDU_BASE_URL = os.environ.get("PDU_BASE_URL", "").strip()
# Outlet 1 = Scope (mount), 2 = Camera on Borean observatory PDU.
PDU_OUTLETS = (1, 2)
# Seconds to wait after turning outlets ON before starting NINA (cold boot).
PDU_WARMUP_SECONDS = 60


def _configure_stdio() -> None:
    """Windows: avoid OSError [Errno 22] when stdout is a pipe with a non-UTF-8 code page."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
            except Exception:
                pass


_configure_stdio()


def log(message: str) -> None:
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    safe = str(message).encode("utf-8", errors="replace").decode("utf-8", errors="replace")
    line = f"[{now}] {safe}"
    try:
        print(line, flush=True)
    except OSError:
        try:
            sys.stdout.buffer.write(line.encode("utf-8", errors="replace") + b"\n")
            sys.stdout.buffer.flush()
        except Exception:
            pass


def queue_bearer_token() -> str:
    """Bearer for nina-sequence / uploads. Prefer Windows env IMAGING_QUEUE_SECRET; never commit secrets."""
    return (TOKEN.strip() or os.environ.get("IMAGING_QUEUE_SECRET", "").strip())


def client_request_headers() -> Dict[str, str]:
    return {
        "Accept": "application/json",
        "User-Agent": AGENT_USER_AGENT,
        "X-Borean-Client": "station-agent",
    }


def build_headers() -> Dict[str, str]:
    headers = client_request_headers()
    bearer = queue_bearer_token()
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    return headers


def reconcile_queue_bearer_token() -> str:
    """Same tenant secret as nina-sequence; optional cron override for hosted cron jobs."""
    return (
        RECONCILE_BEARER.strip()
        or queue_bearer_token()
        or os.environ.get("BOREAN_CRON_SECRET", "").strip()
    )


def pdu_credentials() -> tuple[str, str]:
    user = os.environ.get("PDU_USER", "").strip()
    password = os.environ.get("PDU_PASSWORD", "").strip()
    return user, password


def pdu_configured() -> bool:
    if not PDU_ENABLED:
        return False
    user, password = pdu_credentials()
    return bool(user and password and str(PDU_BASE_URL).strip())


def pdu_request(path: str) -> None:
    """GET a Digital Loggers PDU path (e.g. outlet?1=ON) with HTTP Basic auth."""
    user, password = pdu_credentials()
    base = str(PDU_BASE_URL).rstrip("/")
    url = f"{base}/{path.lstrip('/')}"
    cred = base64.b64encode(f"{user}:{password}".encode("ascii")).decode("ascii")
    req = urllib.request.Request(url, headers={"Authorization": f"Basic {cred}"})
    with borean_urlopen(req, timeout=15) as resp:
        resp.read()


def pdu_set_outlets(state: str, outlets: tuple[int, ...] = PDU_OUTLETS) -> bool:
    """Turn PDU outlets ON or OFF. Returns True if all requests succeeded."""
    state = state.upper()
    if state not in ("ON", "OFF"):
        raise ValueError(f"invalid PDU state: {state}")
    ok = True
    for outlet in outlets:
        try:
            pdu_request(f"outlet?{outlet}={state}")
            log(f"PDU outlet {outlet} -> {state}")
        except Exception as ex:
            ok = False
            log(f"PDU outlet {outlet} {state} failed: {ex}")
    return ok


def power_on_observatory_equipment() -> bool:
    """Turn on mount + camera outlets before NINA. Returns True if PDU control ran."""
    if not pdu_configured():
        if PDU_ENABLED:
            log("PDU enabled but PDU_USER / PDU_PASSWORD not set; skipping power ON.")
        return False
    log(f"PDU: turning ON outlets {PDU_OUTLETS} at {PDU_BASE_URL}")
    if not pdu_set_outlets("ON"):
        log("PDU: one or more outlets failed to turn ON.")
    warmup = max(0, int(PDU_WARMUP_SECONDS))
    if warmup > 0:
        log(f"PDU: waiting {warmup}s for equipment boot before NINA.")
        time.sleep(warmup)
    return True


def power_off_observatory_equipment() -> None:
    """Turn off mount + camera outlets after NINA exits."""
    if not pdu_configured():
        return
    log(f"PDU: turning OFF outlets {PDU_OUTLETS} at {PDU_BASE_URL}")
    pdu_set_outlets("OFF")


def http_error_detail(ex: urllib.error.HTTPError) -> str:
    try:
        body = ex.read().decode("utf-8", errors="replace").strip()
    except Exception:
        body = ""
    if "error 1010" in body.lower() or "access denied" in body.lower():
        return (
            f"HTTP {ex.code} blocked by Cloudflare (browser signature). "
            f"Update Station to the latest release or run Personal Hub at {LOCAL_HUB_URL}."
        )
    if body:
        return f"HTTP {ex.code}: {body[:300]}"
    return f"HTTP {ex.code}: {ex.reason}"


def _r2_env(name: str, inline: str) -> str:
    return (inline.strip() or os.environ.get(name, "").strip())


def r2_account_id() -> str:
    return _r2_env("R2_ACCOUNT_ID", R2_ACCOUNT_ID)


def r2_access_key_id() -> str:
    return _r2_env("R2_ACCESS_KEY_ID", R2_ACCESS_KEY_ID)


def r2_secret_access_key() -> str:
    return _r2_env("R2_SECRET_ACCESS_KEY", R2_SECRET_ACCESS_KEY)


def r2_bucket_name() -> str:
    return _r2_env("R2_BUCKET", R2_BUCKET)


def r2_public_base_url() -> str:
    return _r2_env("R2_PUBLIC_BASE_URL", R2_PUBLIC_BASE_URL)


def r2_object_prefix() -> str:
    prefix = _r2_env("R2_PREFIX", R2_PREFIX)
    return prefix or "imaging"


def r2_credentials_configured() -> bool:
    return bool(r2_account_id() and r2_access_key_id() and r2_secret_access_key() and r2_bucket_name())

def try_reconcile_queue_schedule() -> None:
    url = str(RECONCILE_QUEUE_URL).strip()
    if not url:
        return
    try:
        req = urllib.request.Request(url, headers=build_headers(), method="GET")
        with borean_urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8", errors="replace").strip()
        log(f"Queue schedule reconcile HTTP {resp.status}: {raw[:300]}")
    except urllib.error.HTTPError as ex:
        log(f"Queue schedule reconcile {http_error_detail(ex)}")
    except Exception as ex:
        log(f"Queue schedule reconcile failed: {ex}")


def download_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers=build_headers(), method="GET")
    with borean_urlopen(req, timeout=300) as resp:
        return resp.read()


def post_json(url: str, payload: dict) -> Optional[dict]:
    data = json.dumps(payload).encode("utf-8")
    headers = build_headers()
    headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with borean_urlopen(req, timeout=120) as resp:
        raw = resp.read().decode("utf-8").strip()
        if not raw:
            return None
        return json.loads(raw)

def report_agent_pulse(nina_running: bool) -> bool:
    url = str(AGENT_PULSE_URL).strip()
    if not url:
        return False
    try:
        post_json(url, {"ninaRunning": nina_running})
        return True
    except urllib.error.HTTPError as ex:
        log(f"Agent pulse {http_error_detail(ex)}")
    except Exception as ex:
        log(f"Agent pulse failed: {ex}")
    return False


def is_nina_running() -> bool:
    # Windows tasklist check
    try:
        result = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq NINA.exe"],
            capture_output=True,
            text=True,
            check=False,
        )
        output = (result.stdout or "") + (result.stderr or "")
        return "NINA.exe" in output
    except Exception:
        return False


def start_nina(sequence_path: Path) -> subprocess.Popen[bytes]:
    nina_exe = str(Path(NINA_INSTALL_DIR) / "NINA.exe")
    args = [nina_exe, "--sequencefile", str(sequence_path), "--runsequence", *NINA_EXTRA_ARGS]
    log(f"Starting NINA with sequence: {sequence_path}")
    return subprocess.Popen(args, cwd=str(Path(NINA_INSTALL_DIR)))


def is_estop_sequence_content(content: bytes) -> bool:
    try:
        payload = json.loads(content.decode("utf-8"))
    except Exception:
        return False
    if not isinstance(payload, dict):
        return False
    borean = payload.get("BoreanAstro")
    return isinstance(borean, dict) and borean.get("SessionType") == "estop"


def poll_emergency_stop_sequence() -> Optional[bytes]:
    url = str(ESTOP_DELIVERY_URL or SEQUENCE_JSON_URL).strip()
    if not url:
        return None
    try:
        content = download_bytes(url)
    except urllib.error.HTTPError as ex:
        if ex.code in (204, 404, 409):
            return None
        return None
    except Exception as ex:
        log(f"Emergency STOP poll failed: {ex}")
        return None
    if is_estop_sequence_content(content):
        return content
    return None


_sse_lock = threading.Lock()
_sse_last_connected_at: float = 0.0
_wake_estop = threading.Event()
_wake_sequence = threading.Event()
_wake_reconcile = threading.Event()


def _agent_sse_connected_recently() -> bool:
    with _sse_lock:
        if _sse_last_connected_at <= 0:
            return False
        return (time.monotonic() - _sse_last_connected_at) <= SSE_CONNECTED_WAIT_SECONDS


def _mark_agent_sse_connected() -> None:
    global _sse_last_connected_at
    with _sse_lock:
        _sse_last_connected_at = time.monotonic()


def _handle_agent_sse_payload(raw: str) -> None:
    try:
        payload = json.loads(raw)
    except Exception:
        return
    if not isinstance(payload, dict):
        return
    event_type = payload.get("type")
    if event_type == "estop":
        _wake_estop.set()
    elif event_type == "poll_sequence":
        _wake_sequence.set()
    elif event_type == "reconcile":
        _wake_reconcile.set()
    if event_type in ("connected", "estop", "poll_sequence", "reconcile", "ping"):
        _mark_agent_sse_connected()
    if event_type in ("connected", "ping"):
        threading.Thread(
            target=lambda: report_agent_pulse(is_nina_running()),
            name="agent-pulse-on-sse",
            daemon=True,
        ).start()


def agent_events_reader_loop() -> None:
    url = str(AGENT_EVENTS_URL).strip()
    if not url:
        log("AGENT_EVENTS_URL not configured; using fallback polling only.")
        return
    while True:
        try:
            req = urllib.request.Request(url, headers=build_headers(), method="GET")
            with borean_urlopen(req, timeout=330) as resp:
                _mark_agent_sse_connected()
                log("Agent events SSE connected.")
                for raw_line in resp:
                    line = raw_line.decode("utf-8", errors="replace").strip()
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data:
                        _handle_agent_sse_payload(data)
        except Exception as ex:
            log(f"Agent events SSE disconnected: {ex}")
        time.sleep(5)


def _wait_agent_wake(timeout_sec: float) -> Optional[str]:
    deadline = time.monotonic() + max(0.1, timeout_sec)
    while time.monotonic() < deadline:
        if _wake_estop.is_set():
            _wake_estop.clear()
            return "estop"
        if _wake_sequence.is_set():
            _wake_sequence.clear()
            return "poll_sequence"
        if _wake_reconcile.is_set():
            _wake_reconcile.clear()
            return "reconcile"
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        _wake_estop.wait(timeout=min(1.0, remaining))
    return None


def sleep_between_polls() -> None:
    if _agent_sse_connected_recently():
        timeout = float(SSE_CONNECTED_WAIT_SECONDS)
    else:
        timeout = float(FALLBACK_POLL_SECONDS)
    wake = _wait_agent_wake(timeout)
    if wake == "reconcile":
        try_reconcile_queue_schedule()
        return
    if wake is None and not _agent_sse_connected_recently():
        try_reconcile_queue_schedule()
        return
    n = int(RECONCILE_EVERY_N_POLLS)
    if n > 0 and str(RECONCILE_QUEUE_URL).strip():
        # Legacy reconcile-on-poll (disabled when RECONCILE_EVERY_N_POLLS = 0).
        pass


def kill_nina_process(process: Optional[subprocess.Popen[bytes]] = None) -> None:
    if process is not None and process.poll() is None:
        log("Terminating tracked NINA process for Emergency STOP…")
        process.terminate()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                pass
    if is_nina_running():
        log("Force-killing NINA.exe via taskkill for Emergency STOP…")
        subprocess.run(
            ["taskkill", "/F", "/IM", "NINA.exe"],
            capture_output=True,
            text=True,
            check=False,
        )


def wait_for_nina_exit(process: subprocess.Popen[bytes]) -> None:
    log("NINA started; agent will pause URL polling until NINA exits.")
    while True:
        code = process.poll()
        if code is not None:
            log(f"NINA exited with code {code}. Resuming URL polling.")
            return
        time.sleep(RUNNING_CHECK_SECONDS)


def validate_config() -> None:
    if "your-domain.com" in SEQUENCE_JSON_URL:
        raise ValueError("Please set SEQUENCE_JSON_URL.")
    host = (urlparse(SEQUENCE_JSON_URL).hostname or "").lower()
    is_production_host = host.endswith("www.boreanastro.com")
    if is_production_host and not queue_bearer_token():
        raise ValueError(
            "Production SEQUENCE_JSON_URL requires a bearer token (same as Vercel IMAGING_QUEUE_SECRET). "
            "Set Windows env IMAGING_QUEUE_SECRET on this PC — do not commit secrets into this file."
        )
    if RECONCILE_EVERY_N_POLLS > 0 and not str(RECONCILE_QUEUE_URL).strip():
        raise ValueError("RECONCILE_QUEUE_URL is empty (check SEQUENCE_JSON_URL).")
    if str(RECONCILE_QUEUE_URL).strip() and not queue_bearer_token():
        log(
            "Queue reconcile URL is set but no bearer token (IMAGING_QUEUE_SECRET from Station). "
            "Reconcile requests will return HTTP 401 until the agent is restarted from Station."
        )
    nina_exe = Path(NINA_INSTALL_DIR) / "NINA.exe"
    if not nina_exe.exists():
        raise ValueError(f"NINA.exe not found: {nina_exe}")
    Path(JOBS_DIR).mkdir(parents=True, exist_ok=True)
    Path(NINA_OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
    if not Path(NINA_OUTPUT_DIR).exists():
        raise ValueError(f"NINA_OUTPUT_DIR not found: {NINA_OUTPUT_DIR}")
    if R2_ENABLED and boto3 is None:
        raise ValueError("R2_ENABLED is True but boto3 is not installed. Run: pip install boto3")
    if R2_ENABLED and not r2_credentials_configured():
        raise ValueError(
            "R2_ENABLED is True but R2 credentials are missing. Set Windows env "
            "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET "
            "(same values as Vercel) — do not commit secrets into this file."
        )
    if PDU_ENABLED and not pdu_configured():
        log(
            "PDU is enabled but URL or credentials are missing; "
            "power control will be skipped until Settings are saved in Station."
        )


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def state_file_path(jobs_dir: Path) -> Path:
    return jobs_dir / ".last_sequence_fingerprint"


def read_last_fingerprint(jobs_dir: Path) -> str:
    state_path = state_file_path(jobs_dir)
    if state_path.exists():
        return state_path.read_text(encoding="utf-8").strip()
    return ""


def write_last_fingerprint(jobs_dir: Path, value: str) -> None:
    state_file_path(jobs_dir).write_text(value, encoding="utf-8")


def sequence_fingerprint(content: bytes) -> str:
    """
    Prefer stable task identifiers from JSON to avoid relaunching
    when only volatile fields (e.g. generated timestamp) changed.
    Falls back to full-content SHA256 when no known identifier exists.
    """
    try:
        payload = json.loads(content.decode("utf-8"))
        if isinstance(payload, dict):
            borean = payload.get("BoreanAstro")
            if isinstance(borean, dict):
                session_type = borean.get("SessionType")
                queue_id = borean.get("QueueId")
                if session_type == "estop" and queue_id not in (None, ""):
                    return f"estop:{queue_id}"
            for key in ("jobId", "requestId", "sequenceId", "id", "version"):
                value = payload.get(key)
                if value not in (None, ""):
                    return f"{key}:{value}"
    except Exception:
        pass
    return f"sha256:{sha256_bytes(content)}"


def extract_sequence_metadata(content: bytes) -> tuple[Optional[str], str, Optional[str]]:
    """
    Returns (session_id, output_mode, filter_name) from downloaded JSON metadata.
    output_mode defaults to raw_zip when missing or invalid.
    """
    try:
        payload = json.loads(content.decode("utf-8"))
    except Exception:
        return None, OUTPUT_MODE_RAW_ZIP, None

    if not isinstance(payload, dict):
        return None, OUTPUT_MODE_RAW_ZIP, None

    output_mode = OUTPUT_MODE_RAW_ZIP
    filter_name: Optional[str] = None
    # Preferred: custom metadata injected by Borean API.
    borean = payload.get("BoreanAstro")
    if isinstance(borean, dict):
        mode = borean.get("OutputMode")
        if mode == OUTPUT_MODE_NONE:
            output_mode = OUTPUT_MODE_NONE
        elif mode not in (None, "", OUTPUT_MODE_RAW_ZIP):
            log(f"Ignoring unsupported output mode '{mode}'; using raw_zip.")
        raw_filter = borean.get("FilterName")
        if isinstance(raw_filter, str) and raw_filter.strip():
            filter_name = raw_filter.strip()
        queue_id = borean.get("QueueId")
        if queue_id not in (None, ""):
            return str(queue_id), output_mode, filter_name

    # Backward-compatible fallback keys.
    for key in SESSION_ID_KEYS:
        value = payload.get(key)
        if value not in (None, ""):
            return str(value), output_mode, filter_name
    return None, output_mode, filter_name


def snapshot_output_files(root_dir: Path) -> Dict[str, int]:
    snapshot: Dict[str, int] = {}
    if not root_dir.exists():
        return snapshot
    for p in root_dir.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix.lower() not in UPLOAD_EXTENSIONS:
            continue
        try:
            snapshot[str(p)] = p.stat().st_mtime_ns
        except OSError:
            continue
    return snapshot


def find_new_or_updated_files(before: Dict[str, int], root_dir: Path) -> list[Path]:
    results: list[Path] = []
    for p in root_dir.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix.lower() not in UPLOAD_EXTENSIONS:
            continue
        key = str(p)
        try:
            mtime = p.stat().st_mtime_ns
        except OSError:
            continue
        if key not in before or mtime > before[key]:
            results.append(p)
    results.sort(key=lambda x: str(x))
    return results


def sanitize_for_key(value: str) -> str:
    return "".join(c if c.isalnum() or c in ("-", "_", ".") else "_" for c in value)


def create_r2_client():
    account_id = r2_account_id()
    endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=r2_access_key_id(),
        aws_secret_access_key=r2_secret_access_key(),
        region_name="auto",
    )


def upload_files_to_r2(files: list[Path], run_id: str, output_root: Path) -> list[dict]:
    if not R2_ENABLED:
        log("R2 upload disabled. Skipping upload phase.")
        return []
    if not files:
        log("No new output files found for upload.")
        return []

    client = create_r2_client()
    uploaded_files: list[dict] = []
    uploaded = 0
    for path in files:
        try:
            relative = path.relative_to(output_root)
        except ValueError:
            relative = Path(path.name)
        object_key = f"{r2_object_prefix()}/{run_id}/{str(relative).replace('\\', '/')}"
        bucket = r2_bucket_name()
        client.upload_file(str(path), bucket, object_key)
        uploaded += 1
        uploaded_files.append(
            {
                "fileName": path.name,
                "objectKey": object_key,
                "sizeBytes": path.stat().st_size,
            }
        )
        public_base = r2_public_base_url()
        if public_base:
            public_url = f"{public_base.rstrip('/')}/{object_key}"
            log(f"Uploaded: {path.name} -> {public_url}")
        else:
            log(f"Uploaded: {path.name} -> s3://{bucket}/{object_key}")
    log(f"Upload phase complete. Uploaded {uploaded} files.")
    return uploaded_files


def pick_preview_source(files: list[Path]) -> Optional[Path]:
    candidates: list[Path] = []
    for p in files:
        if p.suffix.lower() in PREVIEW_EXTENSIONS:
            candidates.append(p)
    if not candidates:
        return None
    candidates.sort(key=lambda p: p.stat().st_mtime_ns, reverse=True)
    return candidates[0]


def build_preview_image(source: Path, run_id: str, jobs_dir: Path) -> Optional[Path]:
    if Image is None or ImageOps is None:
        log("Pillow not installed; skipping preview generation. Run: pip install pillow")
        return None
    preview_path = jobs_dir / f"{run_id}_preview.jpg"
    if source.suffix.lower() in {".fit", ".fits"}:
        return build_preview_from_fits(source, preview_path)
    try:
        with Image.open(source) as img:
            oriented = ImageOps.exif_transpose(img)
            rgb = oriented.convert("RGB")
            if rgb.width > PREVIEW_MAX_WIDTH and PREVIEW_MAX_WIDTH > 0:
                scale = PREVIEW_MAX_WIDTH / float(rgb.width)
                new_size = (PREVIEW_MAX_WIDTH, max(1, int(rgb.height * scale)))
                rgb = rgb.resize(new_size, RESAMPLE_LANCZOS)
            rgb.save(preview_path, format="JPEG", quality=PREVIEW_JPEG_QUALITY, optimize=True)
            log(f"Preview generated from {source.name}: {preview_path.name}")
            return preview_path
    except Exception as ex:
        log(f"Failed to build preview from {source.name}: {ex}")
        return None


def build_preview_from_fits(source: Path, preview_path: Path) -> Optional[Path]:
    if fits is None or np is None or Image is None:
        log("FITS preview requires astropy + numpy + pillow. Run: pip install astropy numpy pillow")
        return None
    try:
        with fits.open(source, memmap=False) as hdul:
            frame = None
            for hdu in hdul:
                data = getattr(hdu, "data", None)
                if data is None:
                    continue
                arr = np.asarray(data)
                if arr.size == 0:
                    continue
                frame = arr
                break
            if frame is None:
                log(f"FITS preview skipped; no image data in {source.name}")
                return None
    except Exception as ex:
        log(f"Failed reading FITS {source.name}: {ex}")
        return None

    try:
        frame = np.squeeze(frame)
        if frame.ndim > 2:
            frame = frame[0]
        frame = frame.astype(np.float32, copy=False)
        finite = np.isfinite(frame)
        if not np.any(finite):
            log(f"FITS preview skipped; all pixels invalid in {source.name}")
            return None
        valid = frame[finite]
        lo = float(np.percentile(valid, 1.0))
        hi = float(np.percentile(valid, 99.5))
        if not np.isfinite(lo) or not np.isfinite(hi) or hi <= lo:
            lo = float(np.min(valid))
            hi = float(np.max(valid))
            if hi <= lo:
                hi = lo + 1.0
        stretched = np.clip((frame - lo) / (hi - lo), 0.0, 1.0)
        img_u8 = np.asarray(stretched * 255.0, dtype=np.uint8)
        image = Image.fromarray(img_u8, mode="L").convert("RGB")
        if image.width > PREVIEW_MAX_WIDTH and PREVIEW_MAX_WIDTH > 0:
            scale = PREVIEW_MAX_WIDTH / float(image.width)
            new_size = (PREVIEW_MAX_WIDTH, max(1, int(image.height * scale)))
            image = image.resize(new_size, RESAMPLE_LANCZOS)
        image.save(preview_path, format="JPEG", quality=PREVIEW_JPEG_QUALITY, optimize=True)
        log(f"Preview generated from FITS {source.name}: {preview_path.name}")
        return preview_path
    except Exception as ex:
        log(f"Failed converting FITS preview from {source.name}: {ex}")
        return None


def report_uploaded_files(session_id: str, files: list[dict]) -> None:
    if not UPLOAD_REPORT_URL.strip():
        log("UPLOAD_REPORT_URL not set. Skipping upload report callback.")
        return
    payload = {
        "queueId": session_id,
        "bucket": r2_bucket_name(),
        "prefix": r2_object_prefix(),
        "files": files,
    }
    post_json(UPLOAD_REPORT_URL, payload)
    log(f"Reported {len(files)} files to backend for queueId {session_id}.")


def upload_preview_to_api(session_id: str, preview_path: Path) -> bool:
    if not PREVIEW_UPLOAD_URL.strip():
        return False
    try:
        data_base64 = base64.b64encode(preview_path.read_bytes()).decode("ascii")
    except Exception as ex:
        log(f"Preview read failed: {ex}")
        return False
    payload = {
        "queueId": session_id,
        "imageId": session_id,
        "contentType": "image/jpeg",
        "dataBase64": data_base64,
    }
    try:
        post_json(PREVIEW_UPLOAD_URL, payload)
    except Exception as ex:
        log(f"Preview API upload failed: {ex}")
        return False
    log(f"Uploaded latest preview via API for session {session_id}.")
    return True


def try_push_live_preview(session_id: Optional[str], run_id: str, files: list[Path], jobs_dir: Path) -> None:
    if not PREVIEW_ENABLED or not session_id or not files:
        return
    source = pick_preview_source(files)
    if not source:
        return
    preview_path = build_preview_image(source, run_id, jobs_dir)
    if not preview_path:
        return
    try:
        upload_preview_to_api(session_id, preview_path)
    finally:
        try:
            preview_path.unlink(missing_ok=True)
        except OSError:
            pass


def make_zip_for_session(files: list[Path], run_id: str, jobs_dir: Path, output_root: Path) -> Optional[Path]:
    if not files:
        return None
    zip_path = jobs_dir / f"{run_id}.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in files:
            try:
                rel = path.relative_to(output_root).as_posix()
            except ValueError:
                rel = path.name
            zf.write(path, arcname=f"{run_id}/{rel}")
    log(f"Packed {len(files)} output file(s) into {zip_path.name}.")
    return zip_path


def process_finished_session(job: dict) -> None:
    session_id = job["session_id"]
    run_id = job["run_id"]
    output_mode = job["output_mode"]
    new_files = job["new_files"]
    jobs_dir = Path(job["jobs_dir"])
    output_root = Path(job["output_root"])

    uploaded_files: list[dict] = []
    temp_outputs: list[Path] = []
    try:
        if output_mode == OUTPUT_MODE_NONE:
            log("Output mode is 'none'; skipping all uploads and ending session.")
            return
        if not new_files:
            log("No new output files after NINA; skipping upload.")
            return
        if not R2_ENABLED:
            log("R2 upload disabled; skipping post-processing upload.")
            return

        zip_path = make_zip_for_session(new_files, run_id, jobs_dir, output_root)
        if zip_path:
            temp_outputs.append(zip_path)
            uploaded_files = upload_files_to_r2([zip_path], run_id, jobs_dir)

        if session_id and uploaded_files:
            report_uploaded_files(session_id, uploaded_files)
    finally:
        for p in temp_outputs:
            try:
                p.unlink(missing_ok=True)
            except OSError:
                pass


def wait_for_nina_and_stream_previews(
    process: subprocess.Popen[bytes],
    session_id: Optional[str],
    output_mode: str,
    run_id: str,
    output_root: Path,
    jobs_dir: Path,
    baseline_snapshot: Dict[str, int],
) -> Optional[bytes]:
    """
    Block until NINA exits. Poll for Emergency STOP every ESTOP_POLL_SECONDS.
    Returns ESTOP sequence bytes when imaging must be interrupted; otherwise None.
    """
    log("NINA started; agent will pause URL polling until NINA exits.")
    rolling_snapshot = dict(baseline_snapshot)
    last_running_pulse_at = 0.0
    last_estop_poll_at = 0.0
    while True:
        code = process.poll()
        if code is not None:
            log(f"NINA exited with code {code}. Resuming URL polling.")
            return None
        now_monotonic = time.monotonic()
        if now_monotonic - last_estop_poll_at >= ESTOP_POLL_SECONDS:
            estop_content = poll_emergency_stop_sequence()
            last_estop_poll_at = now_monotonic
            if estop_content is not None:
                log("Emergency STOP sequence received — killing NINA to run ESTOP.")
                kill_nina_process(process)
                return estop_content
        if now_monotonic - last_running_pulse_at >= RUNNING_PULSE_INTERVAL_SECONDS:
            report_agent_pulse(True)
            last_running_pulse_at = now_monotonic
        if PREVIEW_ENABLED and session_id and output_mode != OUTPUT_MODE_NONE:
            changed = find_new_or_updated_files(rolling_snapshot, output_root)
            if changed:
                try_push_live_preview(session_id, run_id, changed, jobs_dir)
                for path in changed:
                    try:
                        rolling_snapshot[str(path)] = path.stat().st_mtime_ns
                    except OSError:
                        pass
        time.sleep(RUNNING_CHECK_SECONDS)


def handle_sequence_launch(
    content: bytes,
    jobs_dir: Path,
    sequence_path: Path,
    output_root: Path,
    postprocess_queue: "queue.Queue[dict]",
) -> Optional[bytes]:
    """
    Write sequence JSON, launch NINA, wait for exit.
    Returns ESTOP bytes when interrupted; otherwise queues post-process and returns None.
    """
    sequence_path.write_bytes(content)
    write_last_fingerprint(jobs_dir, sequence_fingerprint(content))
    is_estop = is_estop_sequence_content(content)
    session_id, output_mode, session_filter = extract_sequence_metadata(content)
    if session_id:
        run_id = sanitize_for_key(session_id)
        if is_estop:
            log(f"Emergency STOP sequence ({session_id}); skipping PDU and post-process.")
        else:
            log(f"Using session id for R2 folder: {run_id}")
    else:
        run_id = sanitize_for_key(sequence_fingerprint(content))
        if not is_estop:
            log("Session id not found in JSON, using fingerprint for R2 folder.")
    before_snapshot = snapshot_output_files(output_root)
    pdu_powered = False
    estop_content: Optional[bytes] = None
    try:
        if not is_estop:
            pdu_powered = power_on_observatory_equipment()
        nina_process = start_nina(sequence_path)
        report_agent_pulse(True)
        if is_estop:
            wait_for_nina_exit(nina_process)
        else:
            estop_content = wait_for_nina_and_stream_previews(
                nina_process,
                session_id=session_id,
                output_mode=output_mode,
                run_id=run_id,
                output_root=output_root,
                jobs_dir=jobs_dir,
                baseline_snapshot=before_snapshot,
            )
    finally:
        if pdu_powered:
            power_off_observatory_equipment()
    report_agent_pulse(False)
    if estop_content is not None:
        return estop_content
    if is_estop:
        return None
    new_files = find_new_or_updated_files(before_snapshot, output_root)
    postprocess_queue.put(
        {
            "session_id": session_id,
            "run_id": run_id,
            "output_mode": output_mode,
            "session_filter": session_filter,
            "new_files": new_files,
            "jobs_dir": str(jobs_dir),
            "output_root": str(output_root),
        }
    )
    log(
        f"Queued post-processing for {run_id} ({output_mode}); pending jobs: {postprocess_queue.qsize()}."
    )
    return None


def run_loop() -> None:
    jobs_dir = Path(JOBS_DIR)
    jobs_dir.mkdir(parents=True, exist_ok=True)
    sequence_path = jobs_dir / LOCAL_SEQUENCE_FILENAME
    output_root = Path(NINA_OUTPUT_DIR)
    postprocess_queue: queue.Queue[dict] = queue.Queue()

    def postprocess_worker() -> None:
        while True:
            job = postprocess_queue.get()
            try:
                process_finished_session(job)
            except Exception as ex:
                log(f"Post-process worker error: {ex}")
                traceback.print_exc()
            finally:
                postprocess_queue.task_done()

    threading.Thread(target=postprocess_worker, name="postprocess-worker", daemon=True).start()
    threading.Thread(target=agent_events_reader_loop, name="agent-events-sse", daemon=True).start()

    log("Agent started.")
    log(f"HTTPS CA bundle: {ssl_ca_status()}")
    last_pulsed_nina_running: Optional[bool] = None

    while True:
        try:
            if SKIP_WHEN_NINA_RUNNING and is_nina_running():
                estop_content = poll_emergency_stop_sequence()
                if estop_content is not None:
                    log("Emergency STOP armed while NINA is running — killing NINA and launching ESTOP.")
                    kill_nina_process()
                    launch_content = estop_content
                    while launch_content is not None:
                        log(
                            "Launching Emergency STOP sequence."
                            if is_estop_sequence_content(launch_content)
                            else "Relaunching after Emergency STOP interrupt."
                        )
                        launch_content = handle_sequence_launch(
                            launch_content,
                            jobs_dir,
                            sequence_path,
                            output_root,
                            postprocess_queue,
                        )
                    sleep_between_polls()
                    continue
                if report_agent_pulse(True):
                    last_pulsed_nina_running = True
                log("NINA is already running. Skipping this poll.")
                sleep_between_polls()
                continue
            if last_pulsed_nina_running is not False and report_agent_pulse(False):
                last_pulsed_nina_running = False

            if _agent_sse_connected_recently() and not (
                _wake_sequence.is_set() or _wake_estop.is_set() or _wake_reconcile.is_set()
            ):
                sleep_between_polls()
                continue

            try:
                content = download_bytes(SEQUENCE_JSON_URL)
            except urllib.error.HTTPError as ex:
                if ex.code == 404:
                    log("No sequence available yet (HTTP 404).")
                    sleep_between_polls()
                    continue
                if ex.code == 403:
                    log(f"Sequence fetch blocked: {http_error_detail(ex)}")
                    sleep_between_polls()
                    continue
                if ex.code == 409:
                    detail = ""
                    try:
                        body = ex.read().decode("utf-8", errors="replace").strip()
                        if body:
                            detail = f" — {body[:500]}"
                    except Exception:
                        pass
                    log(f"Sequence not ready yet (HTTP 409, server-side gate not met){detail}.")
                    sleep_between_polls()
                    continue
                raise
            except urllib.error.URLError as ex:
                reason = getattr(ex, "reason", None)
                err_text = str(ex)
                if isinstance(reason, ConnectionRefusedError) or "10061" in err_text:
                    log(
                        f"Cloud hub not reachable for tenant '{_tenant_id()}' at {_api_base_url()} "
                        "(connection refused). Check network or www.boreanastro.com status."
                    )
                    sleep_between_polls()
                    continue
                if "CERTIFICATE_VERIFY_FAILED" in err_text or "certificate verify failed" in err_text.lower():
                    log(
                        "HTTPS certificate verification failed connecting to the cloud hub. "
                        "Borean uses Cloudflare (Google Trust) certs; Pomfret uses Let's Encrypt "
                        "which is why the old agent worked on this PC. Update Station to v0.1.6+ "
                        "or run: py -3 -m pip install --upgrade certifi"
                    )
                    sleep_between_polls()
                    continue
                raise

            current_fingerprint = sequence_fingerprint(content)
            session_id, output_mode, session_filter = extract_sequence_metadata(content)
            last_fingerprint = read_last_fingerprint(jobs_dir)
            if current_fingerprint == last_fingerprint:
                if is_nina_running():
                    sleep_between_polls()
                    continue
                if last_fingerprint and sequence_path.is_file():
                    log("Sequence unchanged since last download and NINA is not running; re-launching.")
                    content = sequence_path.read_bytes()
                    session_id, output_mode, session_filter = extract_sequence_metadata(content)
                else:
                    sleep_between_polls()
                    continue
            else:
                log("New sequence content detected, downloading and launching.")
                sequence_path.write_bytes(content)
                write_last_fingerprint(jobs_dir, current_fingerprint)
            launch_content: bytes = content
            while launch_content is not None:
                if is_estop_sequence_content(launch_content):
                    log("Launching Emergency STOP sequence.")
                launch_content = handle_sequence_launch(
                    launch_content,
                    jobs_dir,
                    sequence_path,
                    output_root,
                    postprocess_queue,
                )
                if launch_content is not None and not is_estop_sequence_content(launch_content):
                    log("Imaging interrupted for Emergency STOP; launching ESTOP sequence immediately.")

        except Exception as ex:
            log(f"Error: {ex}")
            traceback.print_exc()

        sleep_between_polls()


def main() -> None:
    validate_config()
    run_loop()


if __name__ == "__main__":
    main()
