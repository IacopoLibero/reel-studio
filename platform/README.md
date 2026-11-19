# Reel Hub: operations manual

How to run, stop, update, back up and fix the stack. What the hub is for and how to use it: the [root README](../README.md).
How it is built: [docs/DESIGN.md](docs/DESIGN.md), [docs/DAILY.md](docs/DAILY.md), [docs/BRANDS.md](docs/BRANDS.md).

## Contents

- [The stack at a glance](#the-stack-at-a-glance)
- [Everyday commands](#everyday-commands)
- [Ports](#ports)
- [Where things live](#where-things-live)
- [Backup and restore](#backup-and-restore)
- [Update](#update)
- [Logs and health](#logs-and-health)
- [Hub environment variables](#hub-environment-variables)
- [One GPU, one VoiceStudio](#one-gpu-one-voicestudio)
- [First start of VoiceStudio](#first-start-of-voicestudio)
- [Log in to Instagram](#log-in-to-instagram)
- [Blender device](#blender-device)
- [Running the hub without Docker](#running-the-hub-without-docker)
- [Removing everything](#removing-everything)

## The stack at a glance

One container, named `CONTAINER_NAME` (default `reel-hub`), restarted automatically (`restart: unless-stopped`). Inside, supervisord runs:

| Program | What | Port |
|---|---|---|
| `hub` | Node 22: REST, server-sent events and WebSocket (the web app, jobs, scheduler, daily loops) | 4000 |
| `voicestudio` | VoiceStudio (uvicorn) with the VoxCPM2 engine | 3900 |
| `display` | Xvfb `:99`, x11vnc and noVNC for the Instagram login window; Chromium runs in it | 6080 (internal) |

Blender, Remotion renders and headless Claude are started by the hub or by Claude when a job needs them. The project folder,
`~/.claude` and `~/.claude.json` are bind-mounted at the **same absolute paths** as on the host.

All configuration is in the repository-root `.env` (made by `./install.sh`, mode 600, never committed; every variable is documented in
[`../.env.example`](../.env.example)). The compose files in this folder are not meant to be run by hand: use `./install.sh`, `./update.sh`,
`./uninstall.sh`, or `dc` as below for any other compose command.

## Everyday commands

Run these from the repository root.

```bash
source scripts/stack-lib.sh          # defines dc (docker compose with the right files), env_get and friends
dc ps                                # state
dc stop                              # stop without removing anything
dc start                             # start again
dc restart                           # stop and start
dc logs -f                           # supervisord output
docker exec "$(env_get CONTAINER_NAME)" supervisorctl restart hub    # restart only the hub
```

`docker ps` shows `(healthy)` when the hub and VoiceStudio both answer.

**Never use `dc down -v`** and never `docker volume prune` while the stack is stopped: they delete the volumes (the Instagram login,
the voice engine and its models).

Restart the hub only when no job is running or queued (Jobs page, or `GET /api/jobs`): a job that is running during a restart ends as failed "interrupted".

## Ports

All published on `127.0.0.1` only. Change them in `.env` and run `./update.sh`.

| Port | Variable | What |
|---|---|---|
| 4000 | `HUB_PORT` | The hub (web app and API). Needs the token. |
| 3900 | `VOICE_PORT` | VoiceStudio API (health check at `/health`). |
| 6080, 5900 | none | noVNC and VNC, inside the container only. The Instagram page reaches noVNC through the hub. |

## Where things live

| What | Where | In git? |
|---|---|---|
| Settings of the stack | `.env` in the project root | no |
| A brand: `brand.json`, style guide, questions, logo, voice sample | `brand/<slug>/` | no (only `brand/_template`) |
| Reels: script, MP4, caption, cover | `reels/<slug>/<n>-<name>/` | no |
| Hub state: jobs, settings, daily plans, analytics, ideas, series, schedule state, failed-step screenshots | `platform/data/` (`jobs.json`, `settings.json`, `brands/<slug>/...`) | no |
| Characters, sounds and frames | `characters/`, `mascot/`, `public/` | no (except `public/a1`) |
| Instagram login (browser profiles, one folder per brand) | Docker volume `<project>_chrome-profile`, mounted at `/data/chrome-profile` | n/a |
| VoiceStudio and the voice engine and models | volumes `voicestudio-config`, `omnivoice-data`, `hf-cache`, `uv-python`, `uv-cache` | n/a |
| whisper.cpp binary and model | volume `whisper-cpp` | n/a |
| The hub's `node_modules` (built for Ubuntu, not for the host) | volume `hub-node-modules` | n/a |
| Deleted brands | `platform/data/trash/<slug>-<time>/` | no |

Volume names are prefixed with `COMPOSE_PROJECT_NAME` (default `reel-studio`).

Note: the compose file also sets `HUB_DATA_DIR=/data` and mounts a volume `hub-data` there, but the hub reads `HUB_DATA` (not
`HUB_DATA_DIR`) and defaults to `platform/data` in the project folder, so the hub's state is in the project folder and not in that volume
(see [TODO.md](../TODO.md)).

## Backup and restore

Nothing is backed up automatically. What matters, small to large:

1. **Your brands and the hub state** (small): `brand/`, `reels/`, `characters/`, `mascot/`, `public/` (your sounds), `platform/data/` and `.env`.
2. **The Instagram login** (small): the volume `<project>_chrome-profile`. If you lose it you only log in again.
3. The voice engine and models (10 to 15 GB): can be downloaded again, no need to back them up. Your voice samples are in `brand/<slug>/voice/`.

```bash
source scripts/stack-lib.sh
mkdir -p ~/reel-hub-backup && chmod 700 ~/reel-hub-backup
dc stop                                                        # a consistent copy of the browser profile
tar czf ~/reel-hub-backup/project-$(date +%F).tgz brand reels characters mascot public platform/data .env 2>/dev/null
docker run --rm -v "$(env_get COMPOSE_PROJECT_NAME)_chrome-profile":/v:ro -v ~/reel-hub-backup:/b alpine \
  tar czf /b/chrome-profile-$(date +%F).tgz -C /v .
dc start
```

The archive of the project contains `.env` and so the hub token: keep it private. Restore, with the stack stopped:

```bash
tar xzf ~/reel-hub-backup/project-<date>.tgz                   # from the repository root
docker run --rm -v "$(env_get COMPOSE_PROJECT_NAME)_chrome-profile":/v -v ~/reel-hub-backup:/b alpine \
  sh -c 'cd /v && tar xzf /b/chrome-profile-<date>.tgz'
dc start
```

`./uninstall.sh --yes` keeps the volumes; `./uninstall.sh --yes --delete-volumes` deletes them.

## Update

```bash
./update.sh
```

It runs `git pull --ff-only`, rebuilds the image (`dc up -d --build`), waits for the hub, runs `npm ci` and the smoke test in the container,
and refreshes the Remotion agent skills from upstream. Your `.env`, volumes, brands and reels are kept.
The hub is not baked into the image: it is read from `platform/hub` (bind mount) and on every container start supervisord runs `npm ci`
(only when `package-lock.json` changed), `npm run build` and `npm run start`. After a plain `git pull` you can restart just the hub
(see above) instead of rebuilding.

Old image layers pile up: run `docker image prune` now and then and `docker system df` to see the total.

## Logs and health

```bash
docker exec "$(env_get CONTAINER_NAME)" tail -f /var/log/reel-hub/hub.log        # also voicestudio.log, display.log, supervisord.log
curl -fsS http://127.0.0.1:4000/api/health                                       # {"ok":true}, needs no token
docker exec "$(env_get CONTAINER_NAME)" bash scripts/smoke-test.sh               # hub, Blender, Remotion, VoiceStudio, Claude
```

Every job also keeps its own log, shown on the Jobs page. A failed Instagram step leaves a screenshot in
`platform/data/brands/<slug>/shots/`.

## Hub environment variables

Set by the compose file from `.env`; useful when you run the hub yourself.

| Variable | Default | What |
|---|---|---|
| `HUB_PORT` | `4000` | Port to listen on. |
| `HUB_HOST` | `0.0.0.0` in Docker, else `127.0.0.1` | Address to listen on. Docker publishes the port on `127.0.0.1` only. |
| `HUB_TOKEN` | none | Access token. If unset the hub makes one in `<data>/dev-token` and says so in the log. |
| `HUB_DATA` | `<root>/platform/data` | Where the hub keeps its state. |
| `REEL_ROOT` | three levels above the hub | The project folder (brands, reels, skills). |
| `HUB_CLAUDE_BIN` | `claude` | The Claude command; in Docker `/usr/local/bin/claude-hub`. |
| `HUB_BLOG_DIR` | `<root>/sources/blog` | Default folder of source texts for the idea jobs (a brand can set its own). |
| `CHROME_PROFILE_ROOT` | `/data/chrome-profile` | Where the Instagram browser profiles live, one folder per brand. |
| `HUB_SCHEDULER` | on | `off` replaces the Instagram scheduler with a stub that does nothing. |
| `HUB_SCHEDULER_MODULE` | `./scheduler/index.js` | Another module with the scheduler interface (a test fixture, for example). |
| `HUB_NOVNC_URL` | `http://127.0.0.1:6080` | Where the Instagram page finds noVNC. |
| `HUB_WEB_DIR` | built web app | Folder with the built web app. |
| `HUB_TERMINAL_CMD` | `claude` in tmux | The command the Claude page runs. |
| `HUB_LOG_LEVEL` | info | Log level. |

## One GPU, one VoiceStudio

The voice engine needs about 8 GB of GPU memory. Do not run a VoiceStudio on the host next to the container's on a small GPU: two copies
of the model do not fit. `scripts/ensure-voice.sh` starts the container (`docker start <name>`) when it exists, and a host environment only
otherwise. `scripts/slot.sh voice 1 -- <command>` queues GPU work so one voice job runs at a time (renders: `render 3`).

In CPU mode (`VOICE_DEVICE=cpu`) there is no GPU limit, but a voice takes many minutes instead of seconds.

## First start of VoiceStudio

`platform/docker/voicestudio-run` installs VoiceStudio on the first start from `github.com/debpalash/VoiceStudio` (the tag `VOICESTUDIO_REF`,
default in the Dockerfile) with `uv sync`, then installs the VoxCPM2 engine with VoiceStudio's own installer
(`POST /engines/sidecar/voxcpm2/install`) and downloads the model weights from Hugging Face. State:
`docker exec <name> cat ~/.config/VoiceStudio/reel-bootstrap.state` and `.../reel-bootstrap.status` (a log). A failed step retries every minute,
finished steps are skipped, and uv keeps its download cache in the volume `uv-cache`.
Set `VOICE_ENGINE_INSTALL=0` in `.env` to skip the engine and model (voices will not work until it is installed).

## Log in to Instagram

Open the hub, choose the brand, open the Instagram page and press the login button: a noVNC window opens on the Chromium running in the
container. Log in yourself (the hub never types your password). The profile of each brand is kept in the volume under
`/data/chrome-profile/<slug>/`.

## Blender device

`BLENDER_DEVICE=cpu|gpu|auto` in `.env` (or on the Settings page), then `dc up -d` to apply. `/usr/local/bin/blender-run` (also installed
as `blender`) reads it: `cpu` is Mesa software GL on Xvfb, `gpu` is NVIDIA GL, `auto` is `gpu` if `nvidia-smi` works.
Test with a character: `docker exec <name> blender -b -P <project>/mascot/<character>.py -- still idle` (writes `mascot/work/still-idle-0-0.png`).

## Running the hub without Docker

For development, or to try the hub against a scratch folder. The Instagram scheduler, Blender and the voice engine are not set up this way;
use `HUB_SCHEDULER=off` or a stand-in scheduler module.

```bash
cd platform/hub && npm ci && npm run build:web
HUB_PORT=4300 HUB_TOKEN=any-token REEL_ROOT=/path/to/a/copy HUB_DATA=/path/to/a/data-folder npx tsx src/index.ts
```

`npm run dev` builds the web app and starts the hub on the defaults; `npm run test` runs the 498 tests.

## Removing everything

`./uninstall.sh` removes the container and image and asks before deleting the volumes. `--yes` keeps the volumes, `--yes --delete-volumes`
deletes them (the Instagram login and the voice engine go with them). Your brands, reels and `platform/data/` are in the project folder and
are never touched by it.
