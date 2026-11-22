<p align="center">
  <img src="docs/images/banner.svg" alt="Reel Hub: one line in, a finished vertical reel out" width="100%">
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Desktop app for Arch Linux" src="https://img.shields.io/badge/app-Arch%20Linux-1793D1?logo=archlinux&logoColor=white">
  <img alt="Node 22" src="https://img.shields.io/badge/node-22-339933?logo=node.js&logoColor=white">
  <a href="https://github.com/IacopoLibero/reel-studio/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/IacopoLibero/reel-studio/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Built for Claude Code" src="https://img.shields.io/badge/built%20for-Claude%20Code-d97757">
</p>

# Reel Hub

**Reel Hub is a reel factory that runs on your own computer: you give it one line, it makes a finished vertical video (voice, word-timed captions, motion graphics, caption, cover) and schedules it on Instagram, with you approving the steps that matter.**

<p align="center">
  <img src="docs/images/hero-overview.jpg" alt="The Reel Hub: analytics, calendar and the daily page, shown with an invented demo brand" width="100%">
</p>

All screenshots in this document show an invented demo brand, "Acme Bakery". No real account or data is shown.

## Contents

- [What it does](#what-it-does)
- [A tour of the hub](#a-tour-of-the-hub)
- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Requirements](#requirements)
- [Creating a brand](#creating-a-brand)
- [The daily loop and its approvals](#the-daily-loop-and-its-approvals)
- [Safety model](#safety-model)
- [Costs and limits](#costs-and-limits)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Project layout](#project-layout)
- [Contributing](#contributing)
- [License and credits](#license-and-credits)

## What it does

- Turns a question ("Why does real sourdough take two days?") into a 1080 x 1920 reel: script, cloned voice, word-timed captions,
  motion graphics written in code with Remotion, an optional Blender character, a caption with hashtags and a cover.
- Runs a **factory**: pick several questions, make the reels in parallel, with a queue so the GPU does one voice job at a time.
- Schedules reels on Instagram through a real browser that you log in to yourself, and checks the result on Instagram's own calendar.
- Optionally runs a **daily loop**: it reads your results, writes a plain-language readout, proposes three ideas and waits for you.
- Handles **several brands**, each with its own pages, data, settings, daily loop and Instagram login.
- Runs as a **desktop app** (an Electron window with a tray icon) on Arch Linux: the hub is bound to `127.0.0.1` and your logins stay on your machine. A Docker setup is still there as an alternative.

The repository holds the platform, a generic Remotion kit, the skills and a brand template. It holds **no brand**: your brands live
on your machine and stay out of git (see [Creating a brand](#creating-a-brand)).

## A tour of the hub

The hub is a web app on `http://127.0.0.1:4000`. The menu on the left is for the brand chosen in the switcher at the top.

### Jobs

![Jobs page: a running job at 60 percent, a queued one and the history](docs/images/jobs-live-progress.png)

Everything the hub does is a job with a progress bar and a log: scheduling, making a reel, reading analytics, creating a brand.

- Watch the step and the log of a running job. Cancel it if it is stuck.
- Jobs of different kinds wait in their own lanes: one browser job at a time, a few reels in parallel.
- A job that was running when the hub restarted is shown as failed with "interrupted"; run it again.

### Daily: the approval

![Daily page waiting for approval: readout, two proposals and three ideas](docs/images/daily-approval.png)

The daily loop ends its automatic part here and waits for you. Nothing is made before you click.

- Read the readout and the proposals. Proposals are only shown, never applied by the hub.
- Untick ideas you do not want and change the closing (A: offer and website, B: follow for tips) of each.
- Press **Create selected** to start the reels, or **Skip today**.

### Daily: the review of a finished reel

![Daily page waiting for review: player, self-check, caption, Confirm and Reject](docs/images/daily-review.png)

- Play the video, read the caption and the automatic self-check.
- **Confirm** opens a slot dialog and schedules the reel on Instagram. **Reject** needs a note and reruns the reel (twice at most).
- Nothing is scheduled before you press Confirm.

### Calendar

![Calendar week view with scheduled posts, a running job and free slots](docs/images/calendar-week.png)

- Shows what is scheduled on Instagram and the free slots of your pattern. Reels made here show their cover and closing.
- Click a free slot to schedule a reel there; drag a post to another slot to reschedule it.
- **Suggest best times** proposes times from your own results once there are enough reels with insights.

### Factory

![Factory: the question list with hook and closing A or B, and the finished reels](docs/images/factory-questions.png)

- The list comes from the brand's `reel-questions.md` (hub data: `data/brands/<slug>/`). Tick questions and press **Send to factory**.
- The closing (A: offer and website, B: follow for tips) is chosen by keyword rules you can edit in Settings; override it per row.
- **Find new ideas** asks Claude for new questions, checked against your list for duplicates.

### Analytics

![Analytics: summary cards, plays per reel, the table and the readout](docs/images/analytics-readout.png)

- **Refresh from Instagram** reads your results through Composio (read-only). **Write the readout** asks Claude what to repeat and what to stop.
- Cards show the best and worst reels; the chart shows plays (bars) and reach (line) per reel.

### Series

![Series: named recurring formats with their questions](docs/images/series-formats.png)

- A series is a recurring format: a promise, a cadence, example hooks and the questions assigned to it.
- **Plan a series** asks Claude to propose one from your results; edit it before you keep it.

### Reels

![Reels page: every reel folder with its files and Instagram state](docs/images/reels-list.png)

- Every folder in the brand's `reels/` folder (`data/brands/<slug>/reels/` in your studio folder) with its cover, files (MP4, caption, cover) and state: not scheduled, in queue, scheduled.
- **Schedule** picks a free slot of your pattern and queues the Instagram job.
- **Click a reel** to open its own page (not a dialog): the video with a player, the cover, the caption, the script, the plan and the files. Next to the video is a **conversation with Claude**: say what to change ("make the headline bigger", "shorten the closing"), and Claude changes the reel's code, renders it again and answers; ask a question first if you only want to understand something. Each message continues the same Claude session, so follow-ups make sense. Before each change the reel is saved in its folder (`.versions`, the last three), and if Claude fails the reel is put back as it was. One change runs at a time per reel; a reel that is being scheduled cannot be changed. A reel already on Instagram can be changed here, but Instagram keeps its own copy.

### New brand

![New brand: the form](docs/images/new-brand-form.png)

- Three ways in: fill in a form, discuss it with an AI, or import a folder or zip. All three end in the same job.
- The form checks colours for contrast and font names against the Google fonts Remotion can load.

![New brand: the AI interview with the running summary](docs/images/new-brand-interview.png)

- The assistant asks one question at a time, in your language, and fills the summary beside the chat.
- At the end you review and edit the generated `brand.json` and style guide, then press Create.

### Settings

![Settings: general, posting schedule, daily loop and factory rules](docs/images/settings.png)

- Posting schedule (the default is 3 posts on Sunday, Tuesday and Thursday, 2 on the other days), the daily loop and the factory rules.
- Blender device, Claude model, which content skills are on, the brand assistant, and deleting a brand (it goes to a trash folder).

The hub also has **Claude** (a terminal in the page running Claude Code), the login to Instagram (in **Settings**: its state, and a button that opens a Chromium window to log in) and
**Character** (the moves of a brand's character).

## How it works

![Architecture: browser, hub, Claude, voice engine, Blender, Remotion, Instagram browser, Composio, per-brand data](docs/images/architecture.svg)

- **One app.** The Electron window starts the hub (Node 22, Fastify, React) as a separate process and shows it. The hub starts and watches
  VoiceStudio (the voice engine) and finds Blender; both are installed by the first-run setup into `data/tools/`, not packed in the app.
  Everything runs as you, with your own files. (The Docker setup runs the same hub, VoiceStudio, Blender and a virtual screen in one container.)
- **Claude does the thinking.** Headless Claude Code, with your own login, writes scripts, ideas and readouts. The `reel` skill
  (`.claude/skills/reel/SKILL.md`) is the recipe for a whole reel.
- **Instagram goes through a browser, not an API.** Playwright drives a Chromium that you logged in to once. It follows a flow proven by
  hand, verifies the post on Instagram's calendar and never enters a password.
- **Per-brand data stays on your machine** and out of git.

The daily loop:

![The daily loop with its two manual approvals](docs/images/daily-loop.svg)

## Quick start

```bash
git clone https://github.com/IacopoLibero/reel-studio.git reel-studio && cd reel-studio
claude                       # once: log in to Claude Code, then quit
cd packaging/arch && makepkg -si     # builds the package from this repository and installs it with pacman
reel-studio                  # or open "Reel Studio" from your application menu
```

The first start shows a **setup screen**. It checks what your computer has (Node, Claude Code, Chromium, FFmpeg, Git, uv, your graphics card) and
installs what the app can install itself:

1. **The video packages** (Remotion, about 600 MB): required.
2. **Blender** (the character, about 400 MB): optional; the app downloads it into `data/tools/`, or uses the one on your system.
3. **VoiceStudio** (the voice): pick a voice mode (best quality on an NVIDIA graphics card, best quality on the processor, light and English only, or no voice for now);
   then choose which voice models to download. Every model shows its licence first and downloads only after you tick that you read it, with a progress bar.
   Voices can be chosen, removed and added later from **Settings > Voice**.

Then open **New brand** in the menu: fill in the form, discuss it with the AI, or import a folder.

The window sits in the tray when you close it, so schedules and the daily loop keep running; **Quit** in the tray menu stops the hub. "Start at login" is in the tray menu too.
`reel-studio --hidden` starts it in the tray only. The package never touches your studio folder (`~/ReelStudio`): update it with a new `makepkg -si`, remove it with `sudo pacman -R reel-studio`.
`makepkg` builds from the last commit, so commit your changes first.

Docker instead of the app: [platform/README.md](platform/README.md#the-docker-setup-alternative). Day-to-day operation (backup, logs, ports) is there too.

## Requirements

- **Arch Linux** (or a derivative) with `pacman`. The package depends on `nodejs`, `npm`, `git`, `ffmpeg`, `chromium`, `uv` and `electron`. Other systems: use the Docker setup.
- **A Claude subscription** (Claude Code) for the AI parts. Log in once with `claude`.
- **A GPU is recommended, not required.** An NVIDIA GPU with about 8 GB runs the voice engine (VoxCPM2) fast. Without it pick a processor mode in the setup:
  everything works, but making the voice of a 40 second reel can take many minutes instead of seconds. The hub, Blender (CPU rendering) and Remotion do not need a GPU.
- **Disk:** about 40 GB free for the best-quality voice on a GPU (VoiceStudio with its packages and models is about 33 GB), much less with the light or processor modes.
- **Internet** at first run: Blender, VoiceStudio and the voice models, and the Remotion agent skills are downloaded from their official sources.
- An Instagram **Business or Creator** account for scheduling. Optional: a Composio account (a free plan exists) for the Analytics page.

## Creating a brand

In the hub open the menu at the top and choose **New brand**. All three ways end in one job that validates everything, makes every
folder and file, and registers the brand without a restart.

1. **Fill in a form.** Name, slug, language, website, what it sells, audience, tone; four colours with a contrast check; two Google
   font names; a logo (a PNG up to 1 MB; without one, covers have no logo frame; change it later in Settings); the two closing lines A and B with a live preview of the last card, and the words that decide which closing a reel gets (words about what
   the brand offers give closing A, advice and daily work give B); an optional offer, Instagram account name, folder of source texts; and the
   voice (let the assistant suggest three voices and pick the one you like, reuse another brand's sample, upload a WAV with its text, or decide later).
2. **Discuss it with an AI.** A chat that asks one question at a time and shows a running summary. It proposes the closing lines and the closing words from what the brand sells. You review the generated
   `brand.json` and style guide before creating. The assistant is a global setting: `claude` (the default, read-only tools, no access to
   credentials or other brands), `codex`, or any command that reads the prompt on stdin. **Only `claude` has been tested.**
3. **Import** a folder or zip with a `brand.json` at the top, to move a brand between machines. Paths that climb out of the folder,
   links, oversized files and zip bombs are refused, and an existing slug is never overwritten.

From a terminal: `./scripts/new-brand.sh my-brand --name "My Brand" --website mybrand.com` makes the same folders with neutral values.

A new brand has an empty question list, the daily loop off and no character, and every page shows a first-step message. Then:
log in to Instagram in Settings (the Instagram section opens a Chromium window; you type the password there), add the first questions (or press **Find new ideas** in the Factory), make the first reel.

**Optional character.** A brand may have a character (a mascot built in Blender). The Character page gives you a ready prompt for an AI
image tool (flat 2D vector, your colours, a sheet with views and eight expressions); you make the sheet elsewhere and upload it.
**Build previews** then asks Claude for a plan and a Blender script and shows flat previews you approve or send back with notes.
**This is experimental: it needs iteration and may not give a finished character**, and turning an approved preview into the moves
the reels use is still manual work. A brand with no character uses full-width scenes and works completely.

**Your brands are not in this repository.** They live in your studio folder (default `~/ReelStudio`): `data/brands/<name>/` is one brand: `identity/` (brand.json, style guide, logo), `mascot/` (the character, its voice and its rendered moves) and `reels/` (one folder per reel: audio, video, and the reel's own code in `code/`), `code/` (code the brand's reels share); its question list, the hub's data of the brand and its Instagram login are in the same folder, so a brand is one folder to back up, move or delete. `workspace/src/` has your branded Remotion code; the sounds every reel can use are in `sfx/` of the program. Back that folder up yourself (a private repository, a drive).

## The daily loop and its approvals

Off by default; switch it on per brand in Settings. Once a day, after 06:00 (Rome time, changeable) and when the computer is online,
the hub collects your results, analyses them, proposes **three ideas** and sends a desktop notification (if you installed the optional
host notifier, see [platform/docs/DAILY.md](platform/docs/DAILY.md)). Then it stops.

1. **Approval 1:** you pick ideas and the closing of each, and press **Create selected**. One `reel.make` job per idea.
2. **Approval 2:** for each finished reel you watch the video and press **Confirm** (it is scheduled on the next free slot, or the one
   you choose) or **Reject** with a note (it is made again, twice at most).

Nothing is created before the first click and nothing is scheduled before the second.

## Safety model

- The hub listens on `127.0.0.1` only and needs a token (random, in `data/dev-token`, mode 600). The app window signs in with a one-time pass that the hub gives only to a request carrying the token, so the token never appears in a command line or an address. The hub contains a terminal and a
  browser logged in to your Instagram: do not expose it to a network without your own authentication and TLS.
- **Credentials never leave the machine.** The Claude login (`~/.claude`) and the Composio login (`~/.composio`) stay in your home folder, the Instagram session lives in the brand's own folder (`data/brands/<brand>/profile/`), and you type your Instagram password yourself in the browser window (in the Docker setup, the noVNC window).
- **What Claude jobs can read.** Jobs read untrusted web text, so `platform/hub/src/jobs/claude-safety.ts` denies them any read of `.env`,
  `~/.claude`, `~/.composio`, `~/.config` and the Instagram profile, and restricts research jobs to a few shell commands. The brand
  assistant has read-only tools and cannot see your other brands.
- **The one broad shell.** The reel-making and reel-editing jobs (`reel.make`, `reel.edit`: the chat on a reel's page) need a broad shell for voice, Blender and render. It cannot read those
  credential files or use `curl`, `wget`, `ssh` or `env`, but a prompt-injected model could still read other files in the project.
  Treat the project folder as the trust boundary.
- In the app the jobs run as you, so they can reach what you can; in the Docker setup the container sees only the project folder, your Claude and Composio files, and the optional source-texts folder.

Full policy and how to report a problem: [SECURITY.md](SECURITY.md).

## Costs and limits

- **Claude:** jobs use your Claude plan's usage. A reel is one long headless session; the daily loop adds a few more a day. Heavy use can hit your plan limits.
- **Composio:** the Analytics page calls Composio's Instagram tools; its free plan has a monthly quota. Check your Composio account.
- **Instagram scheduling:** Instagram accepts scheduled posts about **30 days ahead**, refuses a time **less than 20 minutes** away, and the video must be **9:16**.
  Scheduling uses the browser you log in to, not a paid API.
- Everything else is free software on your hardware. Using Instagram through an automated browser is subject to Instagram's terms.

## Configuration

The app needs no configuration file. Everything about a brand is in its folder (`brand.json`, `settings.json`), not in environment variables.
These optional variables change where the app looks (set them in the environment of the app, for example in `~/.config/environment.d/`):

| Variable | Default | What it does |
|---|---|---|
| `REEL_STUDIO_HOME` | `~/ReelStudio` | Your studio folder: `workspace/` (the Remotion project the program fills), `data/` (brands, hub state, `tools/`). Never touched by the package. |
| `HUB_PORT` | `4000` | Port of the hub, on `127.0.0.1` only. |
| `VOICE_PORT` | `3900` | Port of VoiceStudio, on `127.0.0.1` only. |
| `HUB_TOKEN` | random | Fixed token instead of the one in `data/dev-token`. |

### Docker setup

Settings of the Docker setup live in `.env` (made by `install.sh`, documented line by line in `.env.example`).

| Variable | Default | What it does |
|---|---|---|
| `COMPOSE_PROJECT_NAME` | `reel-studio` | Prefix of the Docker volumes. Change it to run a second copy. |
| `CONTAINER_NAME`, `IMAGE_NAME` | `reel-hub` | Container and image names. |
| `HUB_PORT` | `4000` | Web hub, published on `127.0.0.1` only. |
| `VOICE_PORT` | `3900` | VoiceStudio API, on `127.0.0.1` only. |
| `HUB_TOKEN` | random | Created by the installer; the hub asks for it once. |
| `HOST_USER`, `HOST_UID`, `HOST_GID`, `HOST_HOME` | detected | The container runs as you, so files belong to you. |
| `REEL_ROOT` | this folder | Absolute path of this repository (the program), mounted at the same path in the container. |
| `STUDIO_HOME` | `~/ReelStudio` | Your studio folder: `workspace/` (brands, reels, Remotion project) and `data/` (hub state, Instagram logins). Never touched by update or uninstall. |
| `GPU` | `0` | `1` passes the NVIDIA GPU to the container. |
| `VOICE_DEVICE` | `cpu` | `gpu` or `cpu`: where the voice engine runs. |
| `BLENDER_DEVICE` | `cpu` | `cpu`, `gpu` or `auto`. Also a setting in the hub. |
| `VOICE_ENGINE_INSTALL` | `1` | `0` skips the VoxCPM2 engine and model (about 15 GB less). |
| `TZ` | `Europe/Rome` | Time zone of the posting slots. |
| `BLOG_MOUNT` | empty | A folder of source texts mounted read-only, when a brand's source folder is outside the project. |

An installation made before brands existed may still carry `BRAND`, `IG_USER_ID`, `IG_ACCOUNT`, `BLOG_DIR`, `OFFER_LAST_DAY` and
`OFFER_REGEX`; the first start copies them once into the brand's `brand.json`. The variables of the hub process itself are in
[platform/README.md](platform/README.md).

## Troubleshooting

- **The setup says something is missing.** Each line says what and how: `sudo pacman -S <package>` for the system programs, an Install button for what the app installs.
  A graphics card shown as "none found" with `nvidia-smi` saying "Driver/library version mismatch" is a driver that needs a reboot.
- **A model download looks stuck.** The bar shows the speed and the time left; "Cancel download" stops it and the next try continues where it stopped.
  The full log of each install step is in `data/setup/<step>.log`.
- **VoiceStudio blocks a model.** Its own licence review is not finished for most models, so the setup downloads with the same call its own settings use, after you read the licence.
  A licence such as CC-BY-NC does not allow commercial use: check it before you publish reels made with that voice.
- **Only the Docker setup:** the points below that mention the container, `.env` or `docker`.

- **Claude hangs inside the container.** Your host Claude settings (hooks, plugins, MCP servers that call host-only programs) can hang
  headless Claude. The hub runs `claude` through `platform/docker/claude-hub`, which reads only project and local settings and keeps your
  login. If you start Claude by hand in the container, use `claude-hub`.
- **Instagram "Reels" notice or the month picker blocks the scheduler.** Instagram shows a one-time notice about reels and a month picker
  for the date. The scheduler handles both (see the scheduler section of [platform/docs/DESIGN.md](platform/docs/DESIGN.md)). If a job fails,
  read its error in Jobs, dismiss the notice once in the browser window that opens when you press *Log in again* in Settings > Instagram,
  and run the job again. A `login_required` failure means: log in again there.
- **Instagram scheduling limits.** About 30 days ahead, at least 20 minutes of lead time, 9:16 only.
- **Out of GPU memory (8 GB).** Only one VoiceStudio can use the GPU: do not run another copy on the host. Voice jobs wait in a queue
  (`scripts/slot.sh voice 1 -- <command>`; renders use `render 3`). The factory does this for you.
- **The first start is slow.** VoiceStudio and the engine are 10 to 15 GB. Progress:
  `docker exec <container> cat ~/.config/VoiceStudio/reel-bootstrap.state`. A failed download retries by itself.
- **Docker disk use.** The image is about 8 GB and each rebuild leaves old layers: run `docker image prune` now and then and
  `docker system df` to see the total. Never `docker volume prune` while the stack is stopped: it deletes the volumes (Instagram login included).
- **Port already in use.** Change `HUB_PORT` or `VOICE_PORT` in `.env` and run `./update.sh`.
- **Files made by the container belong to root.** Check `HOST_UID` and `HOST_GID` in `.env`.
- **A Remotion skill is missing.** The installer fetches them from upstream; if that was unreachable it continued without them
  and printed how to retry (`scripts/install-remotion-skills.sh`).

## FAQ

**Can I use it without a GPU?** Yes, in CPU mode. The voice is the slow part; the rest is the same.

**Does it post for me automatically?** It schedules in Instagram's own scheduler, after you confirm each reel. It never publishes at once.

**Do I need an Instagram API or a Facebook app?** No for scheduling (a browser you log in to). Analytics use Composio; Threads posting would need your own Meta app and is paused.

**Is my Instagram password stored?** No. You type it in the browser window of the hub; only the browser profile (cookies) stays in a Docker volume.

**Can I run two brands?** Yes, as many as you like. Each has its own Instagram login, settings and daily loop; browser jobs run one at a time.

**Can I use another AI than Claude?** The jobs run headless Claude Code. Only the brand interview can use `codex` or a custom command, and those are untested.

**Where is my data?** In your studio folder, `~/ReelStudio` by default: `data/brands/<name>/` (one folder per brand: identity, character, reels, question list, Instagram login) and `workspace/` (the Remotion project the program fills; your reels' code is in the brand folders). Docker volumes hold only the voice engine, its models and caches. [platform/README.md](platform/README.md) shows how to back it up.

## Project layout

```text
packaging/arch/                     PKGBUILD, launcher and desktop entry of the pacman package
platform/desktop/                   the Electron app (window, tray, notifications, start at login)
install.sh update.sh uninstall.sh   install, update, remove the Docker setup
.env.example                        every setting, documented
platform/                           compose files, Dockerfile, the hub (platform/hub), docs, vendored Ootto skills
platform/docs/                      DESIGN (the hub), DAILY (skills, analytics, daily loop), BRANDS (multi-brand)
scripts/                            voice, slot queue, new-brand, migrate-layout, migrate-brand-folders, the public folder of a render, smoke test, helpers
src/                                generic Remotion kit (src/kit) and cover (src/cover); your reels' code is in each brand's folder (`reels/<n>-<name>/code/`), outside this repository
brand/_template/                    the template new brands are made from (read from here, not copied into the workspace)
sfx/                                the sounds every reel can use (read from here)
.claude/skills/                     the reel skill and its helpers (reel, reel-hooks, reel-research, reel-insights, reel-threads)
docs/images/                        screenshots and diagrams of this README
TODO.md                             open items and decisions
```

## Contributing

Open work is in [TODO.md](TODO.md). How to set up, test and send a change: [CONTRIBUTING.md](CONTRIBUTING.md).
The screenshots come from a scratch instance with an invented brand; see CONTRIBUTING.md before you replace one.

## License and credits

Reel Hub is MIT-licensed ([LICENSE](LICENSE)). It builds on other projects. The list below is a good-faith summary and **not legal
advice**; read each project's own license, especially for commercial use. Details: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

- **Ootto content skills** ([Ootto-AI/claude-content-skills](https://github.com/Ootto-AI/claude-content-skills)): MIT, vendored unmodified in `platform/skills/ootto/`.
- **Remotion** ([remotion.dev](https://www.remotion.dev)): not MIT. As stated by the maintainer of this project, it is free for teams of up to
  3 people, and larger companies need a company license. Read [remotion.dev/license](https://www.remotion.dev/license) yourself before you use it for a company.
- **Remotion agent skills** ([remotion-dev/skills](https://github.com/remotion-dev/skills)): downloaded from upstream at install time, not part of
  this repository and not redistributed. That repository declares no license, so check its terms yourself.
- **VoiceStudio** ([debpalash/VoiceStudio](https://github.com/debpalash/VoiceStudio)): AGPL-3.0. Downloaded at first start and run as a separate local service, not bundled.
- **VoxCPM2** voice model ([openbmb/VoxCPM2](https://huggingface.co/openbmb/VoxCPM2)): the official model card states Apache-2.0 (checked 2026-11-20).
  Cloning a person's voice needs that person's consent.
- **Blender** ([blender.org](https://www.blender.org)): GPL-2.0-or-later, downloaded while building the image and used as a separate program.
- **whisper.cpp** ([ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp)): MIT. Playwright: Apache-2.0. Claude Code and Composio: their own terms.
