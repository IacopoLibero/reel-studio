# Reel Hub: design

How the hub is built and why. Decided on 2026-11-19, brought up to date on 2026-11-20 against the code. Lines marked **Changed** record a
decision that was revised while building. For running it see [../README.md](../README.md); for the daily loop, skills and analytics see
[DAILY.md](DAILY.md); for brands see [BRANDS.md](BRANDS.md).

## The app (2026-11-22)

The normal way to run it is now a desktop app, a pacman package (`packaging/arch/`). **Changed:** the hub no longer needs Docker; the container setup below is the alternative.

- **Electron shell** (`platform/desktop/`): starts the hub as a separate Node process (so `node-pty` is not rebuilt for Electron), waits for `/api/health`,
  opens a window on it, sits in the tray (closing the window hides it; the hub keeps its schedules), polls `/api/notifications?unseen=1` every minute and shows them as system
  notifications, and offers "Start at login" (an autostart entry). Only one copy runs. The window may only show the hub: links to other sites open in the browser, permissions are refused.
- **Sign-in of the window:** the app reads the token from `data/dev-token` and asks `POST /api/enter-nonce` for a one-time pass (30 seconds, used once);
  the window opens `/api/enter?n=<pass>`, which sets the cookie. The token is never in a command line or an address, and `/api/enter` answers only for `127.0.0.1` / `localhost` hosts (DNS rebinding).
- **Native start of the hub** (`src/index.ts`, outside Docker): the program's files are copied into the workspace, the app's Blender (`data/tools/bin/blender`, `blender-run`) is put on the `PATH`,
  and a `VoiceSupervisor` starts VoiceStudio if nothing answers on its port, restarts it when it stops (up to 5 times in a row) and stops it with the hub.
- **First-run setup** (`src/setup/`, `src/routes/setup.ts`, `web/pages/Setup.tsx`): pure checks of the machine (`checks.ts`), the voice modes (`voice-modes.ts`), a step runner with a log per step (`installer.ts`),
  and the steps: workspace packages (`npm ci`; an empty root-owned `node_modules` left by Docker is removed first), Blender (pinned tarball with SHA-256), VoiceStudio (git clone of a pinned tag, `uv sync`, the engine, the model, engine selection; the server is stopped at the end).
  Everything VoiceStudio writes stays in `data/tools/voicestudio/` (its own `HOME`), so deleting that folder removes the voice.
- **Voice models** (`src/setup/voice-catalog.ts`, `voice-engines.ts`, `src/routes/setup-voice.ts`, `web/pages/SetupVoice.tsx`, also in Settings): only voice (TTS) models; transcription and language models are not used.
  VoiceStudio's reviewed-install path (`/models/install/prepare` and `commit`) blocks every voice model of this version (its review of licences and sources is not finished), so the download uses
  `POST /models/install`, the call its own settings screen uses, after the person ticks that they read the licence (the server refuses without it). Progress comes from `/models/install/status`.
  A voice is chosen with `POST /engines/select`; the voice in use cannot be removed.
- **Not packed in the app:** Blender, VoiceStudio and its models are downloaded at first run into `data/tools/`.

## What it is for

A web platform that is always up (as the app, or in Docker: one container, default name `reel-hub`, restart policy `unless-stopped`). Everything lives under
`platform/` of the repository. It lets one person:

- run a **Claude session inside the page** (a terminal running Claude Code with their own login);
- have a **browser that schedules reels on Instagram in the background**, with a progress bar;
- make whole reels in the container (voice, Blender, Remotion, ffmpeg, whisper.cpp);
- see and approve everything in one place, for **several brands**, each with its own pages and data.

## Fixed facts

- **Same paths inside and out.** The container runs as the host user (name, uid, gid from `.env`, written by `install.sh`) and mounts the project,
  `~/.claude` and `~/.claude.json` at the same absolute paths as on the host, so every path in skills, scripts and logs is valid on both sides.
  The user is created at container start by `platform/docker/entrypoint.sh`.
- **Claude login:** the user's own (mount of `~/.claude`), no API key. The hub runs `claude` through `platform/docker/claude-hub`
  (`--setting-sources project,local`) because the host's user hooks and plugins hang headless Claude inside the container.
- **Instagram login:** done by the user in a Chromium window (on the desktop in the app; a noVNC window onto a Chromium inside the container in Docker). Nobody types the password for them. The login state and the button that opens the window are in **Settings > Instagram**; there is no Instagram page. Reads (session check, calendar) run in a headless browser; the login and the schedule flow use a window.
  The browser profile persists in a Docker volume, one folder per brand.
- **VoiceStudio** (uvicorn on 3900, with the VoxCPM2 engine) lives in named Docker volumes, filled at first start from the official sources
  (`platform/docker/voicestudio-run`: git clone of a pinned tag, `uv sync`, then VoiceStudio's own installer for the engine). Nothing is copied
  from the host. Do not run a host VoiceStudio next to it on a GPU of 8 GB: two copies of the model do not fit.
- **GPU is optional.** `VOICE_DEVICE=gpu|cpu`, `GPU=1` passes the NVIDIA GPU through. CPU mode works but the voice is slow.
- **Blender** 5.3 from the official tarball. Headless Workbench needs a GL context: `BLENDER_DEVICE=gpu` uses NVIDIA GL, `cpu` uses Mesa software
  GL under Xvfb, `auto` picks. It is a setting, not hard-coded.
- **Host binaries are not copied.** The host's glibc differs: whisper.cpp is built in the image or the volume, and the hub's `node_modules`
  live in a volume.
- **Security.** The hub gives a shell. It is published on `127.0.0.1` only and needs a token (`HUB_TOKEN`, generated into the root `.env`,
  never committed or printed). **Changed:** the token used to live in `platform/.env`; it is the root `.env` now.
- **Where the state is.** In the studio folder, outside the program: the hub reads `HUB_DATA` (`<STUDIO_HOME>/data`) and works in `REEL_ROOT`
  (`<STUDIO_HOME>/workspace`, a Remotion project); the repository is only the program (`PROGRAM_ROOT`) and the hub copies its own files into the workspace
  at every start (`src/layout/`). **Changed:** the first design kept state in a Docker volume at `/data`, then in `platform/data` inside the project folder;
  each brand's Instagram login moved from a volume into `<data>/brands/<slug>/profile`.

## Services in the container (supervisord)

1. `hub` (Node 22): REST, server-sent events and WebSocket on port 4000.
2. `voicestudio`: uvicorn on port 3900.
3. `display`: Xvfb `:99`, x11vnc and noVNC (websockify) for the Instagram login window; Chromium runs in it.
4. On demand: Blender, Remotion renders, headless Claude, spawned by the hub or by Claude.

## The hub: pages

Every page is for the brand chosen in the switcher; the address is `#/<brand>/<page>`.

| Page | What it does |
|---|---|
| **Jobs** | The job list with a progress bar each (live through server-sent events), a log, cancel. |
| **Daily** | The daily loop: readout, proposals, three ideas to approve, review of each finished reel. See DAILY.md. |
| **Calendar** | Posts scheduled on Instagram (read by the scheduler), free slots of the pattern, drag to reschedule, delete, best-time suggestion. |
| **Claude** | xterm.js over WebSocket, backed by node-pty running `claude` in the project folder inside tmux, so it survives reloads. |
| **Factory** | Questions from `reel-questions.md`, make reels, find new ideas. See below. |
| **Analytics** | Results of the reels (Composio, read-only), a chart, a table, a plain-language readout. |
| **Series** | Recurring formats, plan a series, assign questions. |
| **Reels** | Every reel folder with its files and Instagram state; Schedule opens a slot picker and creates an `instagram.schedule` job. A click opens the page of one reel (`#/<brand>/reels/<folder>`): video (served with `Range`, so it seeks), cover, caption, script, plan, files, and the chat that edits it (see *Editing a reel by chat*). |
| **Character** | The moves of the brand's character (PNG sequences in `<brand>/mascot/movements/<move>/`), add a move with Claude and Blender, re-render one. For a brand without one: the experimental character-from-a-picture steps. |
| **Settings** | Per brand: Instagram login, posting schedule, daily loop, factory rules, voice, delete brand. Global: Blender device, Claude model, brand assistant, which content skills are on. |
| **New brand** | The brand creator (see BRANDS.md). |

## Job model

All long work is a job. Fields: `id`, `type`, `brand`, `title`, `status` (`queued|running|done|failed|cancelled`), `progress` (0 to 1), `step`,
`steps`, `stepIndex`, `log`, `params`, `result`, `error`, timestamps. Types: `instagram.schedule`, `instagram.reschedule`, `instagram.delete`,
`reel.make`, `reel.edit` (one turn of the chat that changes a reel), `reel.ideas`, `daily.run`, `analytics.collect`, `reel.insights`, `series.plan`, `schedule.suggest`, `brand.create`,
`character.build`, `blender.render`, `claude.task` (`voice.generate` is declared but not used by the hub).

API: `GET /api/jobs`, `GET /api/jobs/:id`, `POST /api/jobs`, `POST /api/jobs/:id/cancel`, `GET /api/events` (SSE), all behind
`Authorization: Bearer <HUB_TOKEN>` or the login cookie `hub_token`. `GET /api/health` needs no token. Brand-scoped routes are
`/api/brands/:slug/...`; the old `/api/...` paths answer for the first brand. Jobs persist in `jobs.json`; a job that was `running` at
startup becomes `failed: interrupted`.

**Lanes.** Jobs run in lanes: `instagram` (one at a time, across all brands), `voice`, `factory` (concurrency per brand, default 2),
`ideas`, `daily`, `analytics`, `brand`, `character`.

## Instagram scheduler (`platform/hub/src/scheduler`)

Playwright (Chromium, headed on the Xvfb display, persistent profile per brand) doing what was first done by hand. The flow on
`https://www.instagram.com/scheduled_content/`:

1. **Schedule content** opens "Create new post". The only `input[type=file]` in the dialog takes the MP4. Wait for the "Crop" step.
2. **Crop: always 9:16.** Open the aspect menu at the bottom left of the preview, choose `9:16`, then Next.
3. **Edit:** the file input under "Cover photo" takes `cover.png`. Next.
4. **Caption:** a `div[contenteditable=true][role=textbox]`; type the whole `caption.md` with plain `#`. Verify the length (Instagram counts each
   emoji twice), the last hashtag, and that there is no `%23`.
5. **Date and time** (the "Schedule content" toggle is on): the date is a button that opens a **month picker**; pick the day. The time is
   three spinbuttons (`Hours`, `Minutes`, `AM PM`): click each and type; one string does not work. Instagram refuses a time less than
   **20 minutes** ahead. Read the values back.
6. Press **Schedule** (never the "Share" button of the edit view, which publishes at once). Wait for "Your reel has been scheduled", then Done.
   A one-time **Reels notice** may appear first; the scheduler dismisses it.
7. **Verify** on the calendar page: reload and find the post at that day and time (caption start matches). Fail the job if it is missing or duplicated.
   A reel is never scheduled twice (state per brand in `scheduled.json`).

Rules: 9:16 always; one reel at a time; a failed step stops the job with the step named in the error;
credentials are never entered: if the login form shows, the job fails with `login_required`. Instagram accepts posts about 30 days ahead.

The posting pattern is a setting per brand (`slotPattern` in the brand's `settings.json`, edited on the Settings page). The default is Sunday,
Tuesday, Thursday 08:00, 16:30 and 19:00; other days 07:30 and 17:30; time zone `Europe/Rome`.

## Factory (`reel.make`)

The hub reads the brand's `reel-questions.md` (in its data folder, `<data>/brands/<slug>/`) on every request (`GET /api/brands/:slug/factory/questions`) and joins it with the reel
folders and `scheduled.json`. The Factory page selects to-do questions and creates one `reel.make` job each.

- **The job** is a headless `claude -p` (through `HUB_CLAUDE_BIN`) in the project folder with a prompt built from `.claude/skills/reel/SKILL.md`
  and the approvals waived. Bash is allowed except `rm -rf`, `git`, `docker`, `systemctl`, `kill`, `sudo`, reads of credential files and the network and
  environment tools (`curl`, `wget`, `nc`, `ssh`, `scp`, `rsync`, `env`, `printenv`, `python3 -c`, `node -e`; see `claude-safety.ts`). Voice, Blender and renders must go through `scripts/slot.sh`. It never schedules on Instagram.
  Steps: Script, Voice, Plan, Build, Render, Checks, Caption, Cover, Done. It fails with the last error if the MP4, `caption.md` and `cover.png`
  are not all present.
- **The folder** `<brand>/reels/<next free n>-<short-name>` is allocated under a lock and created at once, so parallel jobs never collide.
- **Ticking:** on success the hub (not Claude) ticks the question under a lock and adds the folder and `closing A|B`.
- **Automatic closing** (`src/factory/classifier.ts`; the keyword lists are in the brand's settings under `factory.closingRules`, editable in Settings,
  overridable per row): the question text decides first. A "product" keyword gives **A** (the brand's offer and website closing), otherwise a
  "general" keyword gives **B** (follow for tips). If the question matches nothing, the source slug is scored the same way, and A needs strictly
  more product than general hits. Ties and no match give B. Keywords match whole words; a trailing `*` matches word starts.
  The default lists are empty, so a new brand gets closing B on every reel until you add keywords in Settings (Factory).
- **Ideas** (`reel.ideas`): Claude proposes new questions (sources checked, deduplicated against the list), shown in the Factory to accept or reject.

## Brands

Everything brand-specific is scoped to one brand: `<data>/brands/<slug>/`, one folder per brand: `identity/` (the zod-validated `brand.json`, `style.md` and the logo), `mascot/`, `reels/`, and the hub's own data of the brand (the question list, settings, daily plans,
analytics, ideas, series, `scheduled.json`, locks, notifications) and the Instagram browser profile
(`<data>/brands/<slug>/profile/`, or the folder named by `instagram.profileDir`). Global settings (Blender device, Claude model, brand assistant)
stay in `<data>/settings.json`. The job queue is shared (one browser flow at a time); each job carries `brand`.
A workspace from before the one-folder-per-brand layout is moved with `scripts/migrate-brand-folders.sh` (copies and checks, removes nothing unless asked). More in [BRANDS.md](BRANDS.md).

## Code layout

- `platform/hub/src/` server (Fastify), one folder per area: `jobs`, `factory`, `ideas`, `daily`, `calendar`, `analytics`, `series`, `brands`, `creator`,
  `character`, `scheduler`, `routes`, `shared` (types used by the web app too).
- `platform/hub/web/` the React app (`pages`, `components`, `creator`).
- `platform/hub/tests/` and `platform/hub/src/scheduler/test/` the tests (hub: 55 files, 498 tests; the scheduler is tested end to end against a mock page).
- Test fixtures stand in for Claude and for the scheduler (`tests/fixtures/fake-*.mjs`); no test touches Instagram or Claude.

## Editing a reel by chat

The page of one reel has a conversation with Claude that changes the reel. Each message is one `reel.edit` job (`src/reels/edit-handler.ts`, lane `edit`, one at a time):

- **Context.** The first turn gets the whole picture: the reel skill, the style guide, the reel's folder, the character's moves that exist, and whether the reel is already scheduled (`edit-prompt.ts`). Later turns resume the same Claude session (`--resume <id>`, the id comes from the `init` line of the stream and is kept in the reel's `chat.json`), so only the request and the rules go. A session that cannot be resumed starts a new one with the full context.
- **Safety.** Before the run the reel (video, caption, cover, script, plan, props, `code/`) is copied to `<reel>/.versions/<time>/`, the newest three are kept (`versions.ts`). The tools are the ones of `reel.make` (voice, Blender and renders only through the slot queue; no git, no posting, no `rm -rf`), plus `--add-dir` of the brand folder. If the run fails, is stopped, or leaves the reel without MP4, caption or cover, the missing deliverables are put back from the snapshot and the chat says so.
- **Rules of the request** (`createSchema`/`editSpec`): the reel must exist; a reel with a change queued or running, or one being scheduled on Instagram, is refused (409); the message is 1 to 4000 characters.
- **The conversation** is `<reel>/chat.json` (the last 200 messages, written atomically); the page shows a message whose job has not started yet from the job's own params. The video address carries a version (the MP4's time and size), so a new render loads at once.
- **Not done:** undo from the page (the versions are only files), editing the script's audio by hand, several reels in one conversation.

