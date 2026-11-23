# Reel Studio: operations manual

How to run, update, back up and fix the app. What it is for and how to use it: the [root README](../README.md).
How it is built: [docs/DESIGN.md](docs/DESIGN.md), [docs/DAILY.md](docs/DAILY.md), [docs/BRANDS.md](docs/BRANDS.md).

## Contents

- [Start and stop](#start-and-stop)
- [Where things live](#where-things-live)
- [Setup and voices](#setup-and-voices)
- [Ports](#ports)
- [Update](#update)
- [Backup and restore](#backup-and-restore)
- [Logs and health](#logs-and-health)
- [Environment variables](#environment-variables)
- [One GPU, one VoiceStudio](#one-gpu-one-voicestudio)
- [Log in to Instagram](#log-in-to-instagram)
- [Blender device](#blender-device)
- [Running the hub without the app](#running-the-hub-without-the-app)
- [Remove](#remove)

## Start and stop

Open "Reel Studio" from the application menu, or run `reel-studio`. The app starts the hub (a Node process) and shows it in a window.
Closing the window hides it in the tray and the hub keeps working (schedules, the daily loop, notifications).

- **Tray menu:** *Open Reel Studio*, *Start at login*, *Quit (stops the hub)*.
- `reel-studio --hidden` starts in the tray only.
- Only one copy runs: starting the app again brings the window back.
- If the hub port (4000) is already taken by another program, the app uses what answers there instead of starting its own hub.
- Killing the app (a logout, `kill`) also stops the hub and the voice server it started.

## Where things live

Your studio folder is `~/ReelStudio` (or `REEL_STUDIO_HOME`). This repository is only the program, so updating or reinstalling it never touches your files.

| What | Where |
|---|---|
| **A brand: one folder** | `~/ReelStudio/data/brands/<slug>/` |
| its identity: `brand.json`, style guide, logo (and the voice when there is no character) | `.../<slug>/identity/` |
| its character: Blender script, model, voice, rendered moves, reference sheet | `.../<slug>/mascot/` (`movements/<move>/` holds the frames, `studio/` the reference sheet) |
| its reels: script, MP4, caption, cover, audio, the code, the chat with Claude (`chat.json`) and the last three versions before a chat change (`.versions/`) | `.../<slug>/reels/<n>-<name>/` |
| code the brand's reels share | `.../<slug>/code/` |
| the hub's data of the brand: question list, settings, schedule, daily plans, analytics, ideas | `.../<slug>/` (`reel-questions.md`, `settings.json`, `scheduled.json`, ...) |
| the Instagram login of the brand (a Chromium profile) | `.../<slug>/profile/` |
| Hub state: jobs, settings, the token, the Claude usage | `~/ReelStudio/data/` (`jobs.json`, `settings.json`, `dev-token`, `claude-usage.json`) |
| API keys saved in Settings (only if you use them), mode 600 | `~/ReelStudio/data/claude-api-key`, `~/ReelStudio/data/codex-api-key` (and `claude-access.json`, `codex-access.json`: which access is chosen) |
| Deleted brands | `~/ReelStudio/data/trash/<slug>-<time>/` |
| What the setup installed: Blender, VoiceStudio and its models | `~/ReelStudio/data/tools/` (delete a folder and the setup offers to install it again) |
| What the setup screen saved, and the log of each install step | `~/ReelStudio/data/setup.json`, `~/ReelStudio/data/setup/<step>.log` |
| The Remotion project the program fills: kit, `scripts/`, base skills, `node_modules`, `whisper.cpp/` | `~/ReelStudio/workspace/` |
| The program: hub, desktop app, scripts, Remotion kit, base skills | `/usr/lib/reel-studio/` (the package) |

**The workspace is the program's.** The program refreshes its own files in it at every start (a file of yours that differs is saved aside in `.reel-studio/overwritten`).
A reel's code is not in it: it lives with the brand (`<brand>/reels/<n>-<name>/code/`, shared code in `<brand>/code/`) and reaches the kit by the aliases `@kit` and `@cover`
(`remotion.config.ts` and `tsconfig.json` define them). Render from the workspace:
`REEL_BRAND=<brand> npx remotion render <brand folder>/reels/<n>-<name>/code/index.ts <CompositionId> out.mp4 --props=<props file>`. `npx tsc --noEmit` there type-checks the kit and every brand's code.

**Where a render finds its files.** Remotion reads the logo, sounds, character frames and the reels' audio with `staticFile()` from one `public` folder, but each brand keeps them in its own folder.
`remotion.config.ts` builds a small public folder for the brand of the run, out of hard links, in `workspace/.reel-studio/public-<uid>/<brand>-<pid>/`: `logo.png` from `identity/`,
`mascot/<move>/` from `mascot/movements/`, `sfx/` (from the program) and `<n>-<name>/<voice>.wav` from each reel's `audio/`. It is removed when the run ends. Nothing is copied by hand into a `public/` folder.

## Claude and Codex: login or API key

**Settings > Claude and Codex** chooses how each signs in.

- **Login** (the default): the tool's own login on this computer: Claude Code with your Claude subscription (run `claude` once), Codex with your ChatGPT account (`codex login`). Any `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in the environment the app was started from is removed for the runs, so the login is what is used.
- **API key:** an Anthropic key (`sk-ant-…`) for Claude, an OpenAI key (`sk-…`) for Codex. Jobs are then paid per use on your account. The key is written once to `data/<tool>-api-key` (readable only by you), never sent back to the page (it shows the last four characters), and put in the environment of the runs of that tool only. For Claude the app also sets `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`, so Claude Code does not hand the key on to the commands it runs; jobs are also forbidden to read the key files. Removing the key goes back to the login.
- **Test** makes one small call with the chosen access and says whether it worked. A change applies to the next job; a job already running keeps what it started with.
- Claude runs the jobs, the reel chat, the daily loop and the brand interview. Codex is only an option for the brand interview (Settings > Brand assistant) and is not tested with real tools; a custom assistant command receives neither key.

**Usage in the sidebar.** With the login, the sidebar shows the **session** (the five-hour window) and the **week** (seven days) of the Claude subscription as bars, with the time they reset (yellow from 70%, red from 90%). The numbers are what Claude itself reports while it works (`rate_limit_event`, read from every Claude run and kept in `data/claude-usage.json`), so they are as fresh as the last run: *read 5 min ago*, with a **Check** button that makes one small call to read them again. With an API key the sidebar shows the cost of the jobs (today and the last 7 days, from the cost each run reports). Codex has no usage display: it reports no limits to the app.

## Setup and voices

The setup screen appears on the first start, and is always reachable from the "Setup" link at the bottom of the menu. It checks the computer and installs what the app can install:
the video packages (`npm ci` in the workspace), whisper.cpp and its model, the Remotion agent skills, Blender (a pinned download, checked with its SHA-256), VoiceStudio (cloned at a pinned tag, its Python packages with `uv`, the engine and its model for the voice mode you chose).
A step that fails says why and can be pressed again; it continues where it stopped. Programs the app cannot install itself (Node, Claude Code, Chromium, FFmpeg, Git, uv, `gcc` and `make`) show the `pacman` command.

**Voices** are in **Settings > Voice**: download a model (its licence first, then a tick, then a progress bar), choose the one to use, remove the ones you do not need. The voice in use cannot be removed.
VoiceStudio blocks its reviewed-install path for every voice model of this version, so the downloads use the same call its own settings use, after you read the licence.
A licence such as CC-BY-NC does not allow commercial use: check it before you publish reels made with that voice.

## Ports

All on `127.0.0.1` only.

| Port | Variable | What |
|---|---|---|
| 4000 | `HUB_PORT` | The hub (web app and API). Needs the token. |
| 3900 | `VOICE_PORT` | VoiceStudio API (health check at `/health`). |

## Update

Pull or edit the repository and commit, close the app, then `cd packaging/arch && makepkg -si`. Your studio folder is never touched.
`makepkg` builds from the last commit. Pacman reinstalls a package of the same version without checking what changed: raise `pkgver` in `packaging/arch/PKGBUILD` for a release.

## Backup and restore

Nothing is backed up by the app, and nothing it does touches your files. To copy your work, quit the app from the tray and copy `~/ReelStudio` (brands, reels, voices, Instagram logins, hub state); copy it back to restore.
`data/tools/` is about 35 GB and can be left out: the setup downloads it again.

## Logs and health

- Started from a terminal (`reel-studio`), the app prints the hub's log, and VoiceStudio's output (lines starting with `[voice]`).
- The install steps log to `~/ReelStudio/data/setup/<step>.log`.
- Health: `curl http://127.0.0.1:4000/api/health` (`{"ok":true}`) and `curl http://127.0.0.1:3900/health` (VoiceStudio and the device it uses).
- The token is `~/ReelStudio/data/dev-token`, readable only by you. The app signs its window in with it by itself (a one-time pass).
- Restart the hub only when no job is running or queued (Jobs page, or `GET /api/jobs`): a job running during a restart ends as failed "interrupted".

## Environment variables

None is needed. These change where the app looks, for the hub it starts (set them where your session sets its environment, for example `~/.config/environment.d/`).

| Variable | Default | What |
|---|---|---|
| `REEL_STUDIO_HOME` | `~/ReelStudio` | The studio folder: `workspace/` and `data/`. |
| `HUB_PORT` | `4000` | Port of the hub. |
| `VOICE_PORT` | `3900` | Port of VoiceStudio. |
| `HUB_TOKEN` | random | A fixed token instead of the one in `data/dev-token`. |
| `HUB_DATA` | `<REEL_STUDIO_HOME>/data` | Where the hub keeps its state. |
| `REEL_ROOT` | `<REEL_STUDIO_HOME>/workspace` | The workspace; Claude jobs run in it. |
| `HUB_CLAUDE_BIN` | `claude` | The Claude Code command. |
| `HUB_BLOG_DIR` | `<workspace>/sources/blog` | A folder of source texts (blog posts) the ideas jobs read. A brand can name its own. |
| `CHROME_PATH` | system Chromium or Chrome | The browser for Instagram. |
| `HUB_SCHEDULER` | on | `off` runs without the Instagram scheduler (tests). |
| `HUB_WEB_DIR` | built web app | Folder of the built web app. |
| `HUB_TERMINAL_CMD` | `claude` in tmux | The command of the Claude page. |
| `HUB_LOG_LEVEL` | `info` | Log level. |

## One GPU, one VoiceStudio

The voice engine needs about 8 GB of GPU memory. Only one VoiceStudio can use it: the app starts one and keeps it running, so do not start another copy of VoiceStudio next to it (two copies of the model do not fit).
`scripts/slot.sh voice 1 -- <command>` queues GPU work so one voice job runs at a time (renders: `render 3`); the jobs do this by themselves.
Without an NVIDIA card pick a processor voice mode in the setup: there is no GPU limit, but the voice of a reel takes many minutes instead of seconds.
If `nvidia-smi` says "Driver/library version mismatch", the driver needs a reboot.

## Log in to Instagram

Open Settings > Instagram for the brand and press *Log in to Instagram*: a Chromium window opens on your desktop. Log in yourself there (the app never types your password), then press *Check again*.
Reads (the calendar, the session check) run without a window; only the login and a schedule flow open one. The login is kept in `~/ReelStudio/data/brands/<slug>/profile/`.

## Blender device

`BLENDER_DEVICE=cpu|gpu|auto` (also the *Blender device* setting). The app's Blender is on the PATH of the jobs as `blender` and `blender-run` (in `~/ReelStudio/data/tools/bin/`); `blender-run` reads the device:
`cpu` software GL, `gpu` the graphics card, `auto` the card when `nvidia-smi` works. Test with a character:
`blender-run -b -P ~/ReelStudio/data/brands/<brand>/mascot/<character>.py -- still idle` (writes `<tmp>/mascot-stills/still-idle-0-0.png`).

## Running the hub without the app

For development, or to try the hub against a scratch folder. The Instagram scheduler is set up the same way as in the app; use `HUB_SCHEDULER=off` to leave it out.

```bash
cd platform/hub && npm ci && npm run build
REEL_STUDIO_HOME=/path/to/a/scratch-folder HUB_PORT=4300 HUB_TOKEN=any-token node dist/index.js
```

`npm run dev` builds the web app and starts the hub on the defaults; `npm run test` runs the tests. The desktop app is `electron platform/desktop`.

## Remove

`sudo pacman -R reel-studio` removes the program. `~/ReelStudio` stays: delete it by hand if you want everything gone (the brands, reels and Instagram logins in it cannot be recovered).
