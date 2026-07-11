# FRAOS ASC (All-Sky Camera) on Raspberry Pi

Run Pomfret’s observatory camera stack so Control / Hub can show the ASC stream and weather-safety can read ASC AI rain / cloud status.

## Source

Canonical implementation lives in the Pomfret Astro repo:

- `website/observatory/camera_service.py` — MJPEG stream + `/status` (includes `sensors.allSkyCam.ascCloud`)
- `website/observatory/asc_cloud_ai.py` — Teachable Machine TFJS cloud/rain inference
- `website/observatory/models/` — ASC AI model bundle (+ `ASC_AI_MODEL_VERSION.json`)
- `website/camera_service_requirements.txt` / `website/observatory/requirements-ai.txt`

Copy or symlink that `observatory/` package onto the Pi (same layout as Pomfret).

## Hub / website env

Point the hub (or Pro website mirror) at the Pi status URL:

```bash
# Preferred — direct status endpoint
export HUB_ASC_STATUS_URL="http://<pi-host>:5000/status"

# Or derive status from the stream URL
export HUB_ASC_STREAM_URL="http://<pi-host>:5000/stream"
```

Website cloud mirror also accepts `ASC_STATUS_URL` / `ASC_STREAM_URL`.

Control Client Weather page reads the stream from Settings (`ascStreamUrl` localStorage) or `VITE_ASC_STREAM_URL`. Thunderstorm Safe/Unsafe uses hub `GET /weather/storm-approach` (fallback: website `/api/weather/storm-approach`).

## Run on the Pi

```bash
cd observatory   # or website/ if using top-level camera_service.py
python3 -m venv .venv
source .venv/bin/activate
pip install -r ../camera_service_requirements.txt
# For ASC AI:
pip install -r requirements-ai.txt

# Optional: patch tensorflowjs for Pi if needed (see patch_tensorflowjs_pi.sh)
export HUB_ASC_STATUS_URL="http://127.0.0.1:5000/status"  # only if the Pi itself posts elsewhere

python3 camera_service.py
# default: http://0.0.0.0:5000/stream  and  /status
```

Confirm:

```bash
curl -s http://<pi-host>:5000/status | jq '.sensors.allSkyCam.ascCloud'
```

## Weather safety

During nautical night, hub/website `triggerWeatherSafetyEmergencyStopCheck` arms ESTOP when:

1. ASC AI reports `rain.detected === true`, or
2. Open-Meteo thunderstorm codes (95/96/99) appear within a 20 km ring (`GET /weather/storm-approach`).

Daytime is a no-op.
