#!/usr/bin/env bash
# Make sure the VoiceStudio voice server is running in the background, with NO window,
# and that the voice engine (VoxCPM2) is selected. Safe to run any time: does nothing if it is already up.
# It runs VoiceStudio's own Python backend directly (the same server the app starts), so there is no
# app window that can be closed by mistake. Everything goes through the local API on port $VOICE_PORT (default 3900).
set -u
PORT="${VOICE_PORT:-3900}"
BASE="http://localhost:$PORT"
CONTAINER="${CONTAINER_NAME:-reel-hub}"
PROJECT="$HOME/.config/VoiceStudio/runtime/project"
LOG="${TMPDIR:-/tmp}/voicestudio-headless.log"

healthy() { curl -s -m 3 "$BASE/health" | grep -q '"status":"ok"'; }

if ! healthy && docker container inspect "$CONTAINER" >/dev/null 2>&1; then
  # the always-on Docker container owns the GPU: start it instead of the host venv
  echo "starting the $CONTAINER container (VoiceStudio inside)..."
  docker start "$CONTAINER" >/dev/null 2>&1
  for _ in $(seq 1 80); do healthy && break; sleep 3; done
fi

if ! healthy; then
  [ -x "$PROJECT/.venv/bin/python" ] || { echo "VoiceStudio backend not found at $PROJECT (run ./install.sh, which sets it up inside the container)" >&2; exit 1; }
  echo "starting the VoiceStudio voice server in the background (no window)..."
  cd "$PROJECT" || exit 1
  # CUDA_HOME is only forwarded when the host has one (for example /opt/cuda on Arch).
  if [ -n "${CUDA_HOME:-}" ]; then export CUDA_PATH="$CUDA_HOME" LD_LIBRARY_PATH="$CUDA_HOME/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"; fi
  OMNIVOICE_PORT="$PORT" CUDA_VISIBLE_DEVICES="${CUDA_VISIBLE_DEVICES:-0}" \
    UV_HTTP_TIMEOUT=900 UV_CONCURRENT_DOWNLOADS=2 \
    setsid nohup .venv/bin/python -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port "$PORT" \
    >"$LOG" 2>&1 </dev/null &
  for _ in $(seq 1 80); do healthy && break; sleep 3; done
fi
healthy || { echo "VoiceStudio did not become ready; see $LOG" >&2; exit 1; }

active=$(curl -s "$BASE/engines/tts" | python3 -I -c "import sys,json;print(json.load(sys.stdin).get('active',''))")
if [ "$active" != "voxcpm2" ]; then
  curl -s -X POST "$BASE/engines/select" -H 'Content-Type: application/json' -d '{"family":"tts","backend_id":"voxcpm2"}' >/dev/null
fi
echo "VoiceStudio ready: $(curl -s "$BASE/health")"
