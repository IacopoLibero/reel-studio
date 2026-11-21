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

Everything of yours lives in **one folder**, `STUDIO_HOME` (default `~/ReelStudio`, written into `.env` by `./install.sh`). This repository is only the program, so updating or reinstalling it never touches your files.

| What | Where | In git? |
|---|---|---|
| **A brand: one folder** | `$STUDIO_HOME/data/brands/<slug>/` | no |
|  its identity: `brand.json`, style guide, logo (and the voice when there is no character) | `.../<slug>/identity/` | |
|  its character: Blender script, model, voice, rendered moves, reference sheet | `.../<slug>/mascot/` (`movements/<move>/` holds the frames, `studio/` the reference sheet) | |
|  its reels: script, MP4, caption, cover, audio | `.../<slug>/reels/<n>-<name>/` | |
|  the hub's data of the brand: question list, settings, schedule, daily plans, analytics, ideas, Instagram login | `.../<slug>/` (`reel-questions.md`, `settings.json`, `scheduled.json`, `profile/`, ...) | |
| The reels' own code (the Remotion project) | `$STUDIO_HOME/workspace/` (`src/r<n>/`, `src/Root.private.tsx`) | no (until the app: see TODO.md) |
| Hub state: jobs, settings | `$STUDIO_HOME/data/` (`jobs.json`, `settings.json`) | no |
| Deleted brands | `$STUDIO_HOME/data/trash/<slug>-<time>/` | no |
| Settings of the stack (token, ports) | `.env` in the repository | no |
| The program: hub, scripts, Remotion kit, base skills | this repository | yes |
| VoiceStudio, the voice engine and its models | Docker volumes `voicestudio-config`, `omnivoice-data`, `hf-cache`, `uv-python`, `uv-cache` | n/a |
| whisper.cpp binary and model | volume `whisper-cpp` (mounted in the workspace) | n/a |
| The hub's `node_modules` (built for Ubuntu, not for the host) and the workspace's | volumes `hub-node-modules`, `workspace-node-modules` | n/a |

Volume names are prefixed with `COMPOSE_PROJECT_NAME` (default `reel-studio`). The volumes hold only caches and models that can be downloaded again.

**The workspace is a Remotion project.** Your own reel code sits in it (brands, reels and sounds do not: see above), and the program fills in its own files next to it: the Remotion kit (`src/kit`, `src/cover`), `scripts/` and the base skills. The common sounds (`sfx/`) are read from the program too. The Ootto skills library (`platform/skills`) is not copied: a skill you switch on is a link, `.claude/skills/ootto-<name>`, to the program's own folder, and the hub points the links at the program again at every start (so an update of the program is an update of the skills). The brand template (`brand/_template`) is read from the program and is not copied. The hub copies those at every start (`workspace/.reel-studio/program.json` lists them), so an update replaces them. If you edited one, your version is first saved in `workspace/.reel-studio/overwritten/<time>/`. Put your own changes in your own folders (`src/<brand>/`).

**Where a render finds its files.** Remotion reads the logo, sounds, character frames and the reels' audio with `staticFile()` from one `public` folder, but each brand keeps them in its own folder. `remotion.config.ts` builds that `public` folder for the brand of the run (the hub sets `REEL_BRAND` for every job) out of hard links, in `workspace/.reel-studio/public-<uid>/<brand>-<pid>/`, and removes it when the run ends: `logo.png` from `identity/`, `mascot/<move>/` from `mascot/movements/`, `sfx/` (from the program) and `<n>-<name>/<voice>.wav` from each reel's `audio/`. Nothing is copied into a shared `public/` folder, so one brand's logo is never drawn on another's cover.

**Moving to one folder per brand** (a workspace made before `identity/`, `mascot/` and `reels/` were inside each brand): stop the hub, run `scripts/migrate-brand-folders.sh` (it only shows the plan), then `scripts/migrate-brand-folders.sh --apply`. It copies and checks, and the originals stay; once the hub works from the new folders, `scripts/migrate-brand-folders.sh --remove-old` lists the old copies that have an identical new copy and `--remove-old --yes` removes them.

**Moving from the old layout** (everything in the repository folder): stop the hub, run `scripts/migrate-layout.sh` (it only shows the plan), then `scripts/migrate-layout.sh --apply`. It copies, never moves: your originals stay until you delete them. Then add `STUDIO_HOME=<folder>` to `.env` and run `./update.sh`.

## Backup and restore

Nothing is backed up automatically. Your files are the studio folder (`workspace/` and `data/`, a few hundred MB to a few GB, mostly your reels and character frames). The voice engine and its models (10 to 15 GB) can be downloaded again, no need to back them up. Your voice samples are in `workspace/brand/<slug>/voice/`.

```bash
source scripts/stack-lib.sh
mkdir -p ~/reel-hub-backup && chmod 700 ~/reel-hub-backup
dc stop                                                        # a consistent copy of the browser profiles
tar czf ~/reel-hub-backup/studio-$(date +%F).tgz -C "$(studio_home)" workspace data
dc start
```

`.env` (the hub token and ports) is not in that archive: copy it by hand if you want it, and keep it private. Restore into an empty studio folder, with the stack stopped:

```bash
source scripts/stack-lib.sh
tar xzf ~/reel-hub-backup/studio-<date>.tgz -C "$(studio_home)"
dc start
```

To use the same studio on another computer, copy the folder, run `./install.sh` there with `STUDIO_HOME` pointing at it, and log in to Claude and Instagram again if the browser profiles were not copied.

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
`$STUDIO_HOME/data/brands/<slug>/shots/`.

## Hub environment variables

Set by the compose file from `.env`; useful when you run the hub yourself.

| Variable | Default | What |
|---|---|---|
| `HUB_PORT` | `4000` | Port to listen on. |
| `HUB_HOST` | `0.0.0.0` in Docker, else `127.0.0.1` | Address to listen on. Docker publishes the port on `127.0.0.1` only. |
| `HUB_TOKEN` | none | Access token. If unset the hub makes one in `<data>/dev-token` and says so in the log. |
| `REEL_STUDIO_HOME` | `~/ReelStudio` | The studio folder; with it set, the workspace is `<it>/workspace` and the data `<it>/data`. In Docker the compose file sets the two below directly. |
| `HUB_DATA` | `<REEL_STUDIO_HOME>/data` | Where the hub keeps its state (settings, jobs, each brand's data and Instagram login). |
| `REEL_ROOT` | `<REEL_STUDIO_HOME>/workspace` | The workspace (brands, reels, the Remotion project); Claude jobs run in it. |
| `PROGRAM_ROOT` | three levels above the hub | The program folder (this repository): the hub's code and the files it copies into the workspace. |
| `HUB_CLAUDE_BIN` | `claude` | The Claude command; in Docker `/usr/local/bin/claude-hub`. |
| `HUB_BLOG_DIR` | `<root>/sources/blog` | Default folder of source texts for the idea jobs (a brand can set its own). |
| `CHROME_PROFILE_ROOT` | none | Old setting: a shared folder with one browser profile per brand. Without it each brand's login is in `<data>/brands/<slug>/profile`. |
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
container. Log in yourself (the hub never types your password). The profile of each brand is kept in your studio folder, in
`data/brands/<slug>/profile/`.

## Blender device

`BLENDER_DEVICE=cpu|gpu|auto` in `.env` (or on the Settings page), then `dc up -d` to apply. `/usr/local/bin/blender-run` (also installed
as `blender`) reads it: `cpu` is Mesa software GL on Xvfb, `gpu` is NVIDIA GL, `auto` is `gpu` if `nvidia-smi` works.
Test with a character: `docker exec <name> blender -b -P <workspace>/brand/<brand>/mascot/<character>.py -- still idle` (writes `<tmp>/mascot-stills/still-idle-0-0.png`).

## Running the hub without Docker

For development, or to try the hub against a scratch folder. The Instagram scheduler, Blender and the voice engine are not set up this way;
use `HUB_SCHEDULER=off` or a stand-in scheduler module.

```bash
cd platform/hub && npm ci && npm run build:web
HUB_PORT=4300 HUB_TOKEN=any-token REEL_STUDIO_HOME=/path/to/a/scratch-folder npx tsx src/index.ts
```

`npm run dev` builds the web app and starts the hub on the defaults; `npm run test` runs the tests.

## Removing everything

`./uninstall.sh` removes the container and image and asks before deleting the volumes. `--yes` keeps the volumes, `--yes --delete-volumes`
deletes them (the voice engine and its models go with them: about 20 GB to download again). Your studio folder (brands, reels, hub data, Instagram logins) is never touched by it.
