# Reel Hub: operations

The stack is one container (name `CONTAINER_NAME`, default `reel-hub`), always on (`restart: unless-stopped`). Inside,
supervisord runs `hub` (port 4000), `voicestudio` (port 3900) and `display` (Xvfb :99 + x11vnc + noVNC on 6080, internal).
Ports are published on 127.0.0.1 only (`HUB_PORT`, `VOICE_PORT` in `.env`). The project, `~/.claude` and `~/.claude.json` are
bind-mounted at the same absolute paths as on the host. Install, update and removal are the scripts at the repository root;
this file is for running and fixing it. The concept and design are in `docs/DESIGN.md` and `docs/DAILY.md`.

All configuration lives in the repository-root `.env` (created by `./install.sh`, mode 600, never committed). Every variable is
documented in `../.env.example`. The compose files here are not meant to be run by hand: use `./install.sh`, `./update.sh`,
`./uninstall.sh`, or `source scripts/stack-lib.sh; dc <args>` for any other compose command.

## Everyday commands (from the repository root)
    source scripts/stack-lib.sh
    dc ps                       # state
    dc stop / dc start          # stop and start without removing anything
    dc logs -f                  # supervisord output
    docker exec "$(env_get CONTAINER_NAME)" tail -f /var/log/reel-hub/hub.log      # also voicestudio.log, display.log

`docker ps` shows `(healthy)` when the hub and VoiceStudio both answer. Never use `dc down -v`: it deletes the volumes
(Instagram login, hub history, VoiceStudio).

## One GPU, one VoiceStudio
The voice engine needs about 8 GB of GPU memory. Do not run a host VoiceStudio and the container one together on a small GPU.
`scripts/ensure-voice.sh` starts the container (`docker start <name>`) when it exists, and a host venv only otherwise.
`scripts/slot.sh voice 1 -- <command>` queues GPU work so only one voice job runs at a time.

## First start of VoiceStudio
`platform/docker/voicestudio-run` installs VoiceStudio on the first start from `github.com/debpalash/VoiceStudio` (tag
`VOICESTUDIO_REF`, default in the Dockerfile) with `uv sync`, then installs the VoxCPM2 engine with VoiceStudio's own
installer (`POST /engines/sidecar/voxcpm2/install`) and downloads the model weights from Hugging Face. State:
`docker exec <name> cat ~/.config/VoiceStudio/reel-bootstrap.state` and `.../reel-bootstrap.status` (a log). A failed step
retries every minute; finished steps are skipped, uv keeps its download cache in the volume `uv-cache`.
Set `VOICE_ENGINE_INSTALL=0` in `.env` to skip the engine and model (voices will not work until it is installed).

## Log in to Instagram
Open the hub, page Instagram, press the login button: a noVNC window opens on the Chromium running in the container.
Log in yourself; the profile is kept in the volume `<project>_chrome-profile` (`/data/chrome-profile`).

## Blender device
`BLENDER_DEVICE=cpu|gpu|auto` in `.env` (or the Settings page of the hub), then `dc up -d` to apply. `/usr/local/bin/blender-run`
(also installed as `blender`) reads it: cpu = Mesa llvmpipe software GL on Xvfb, gpu = NVIDIA GL, auto = gpu if `nvidia-smi` works.
Test: `docker exec <name> blender -b -P <project>/mascot/<character>.py -- still idle` (writes `mascot/work/still-idle-0-0.png`).

## Update
`./update.sh` (git pull, `dc up -d --build`). The hub is not baked into the image: it is read from `platform/hub` (bind mount);
on every container start supervisord runs `npm ci` (only when package-lock.json changed), `npm run build`, `npm run start`.
Restart just the hub with `docker exec <name> supervisorctl restart hub`. `node_modules` of the hub live in the volume
`<project>_hub-node-modules` (built for Ubuntu, not for the host).

## Volumes (names are prefixed with COMPOSE_PROJECT_NAME)
`voicestudio-config` (~/.config/VoiceStudio: the VoiceStudio source, venv and state), `omnivoice-data` (~/.omnivoice: engine,
voices, outputs), `hf-cache` (~/.cache/huggingface), `uv-python` and `uv-cache` (Python and download cache for uv),
`whisper-cpp` (project/whisper.cpp: sources, binary built in the container, model), `hub-data` (/data), `chrome-profile`,
`hub-node-modules`. Back up `chrome-profile` and `hub-data` (small); the rest can be downloaded again.
