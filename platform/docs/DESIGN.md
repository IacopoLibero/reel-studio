# Reel Hub: design

How the hub is built and why. Decided on 2026-11-19, brought up to date on 2026-11-20 against the code. Lines marked **Changed** record a
decision that was revised while building. For running it see [../README.md](../README.md); for the daily loop, skills and analytics see
[DAILY.md](DAILY.md); for brands see [BRANDS.md](BRANDS.md).


## The app (2026-11-22)

It runs as a desktop app, a pacman package (`packaging/arch/`). **Changed (2026-11-22):** the first design ran the hub in one Docker container; that setup was removed and the hub runs on the host.

- **Electron shell** (`platform/desktop/`): starts the hub as a separate Node process (so `node-pty` is not rebuilt for Electron), waits for `/api/health`,
  opens a window on it, sits in the tray (closing the window hides it; the hub keeps its schedules), polls `/api/notifications?unseen=1` every minute and shows them as system
  notifications, and offers "Start at login" (an autostart entry). Only one copy runs. The window may only show the hub: links to other sites open in the browser, permissions are refused.
- **Sign-in of the window:** the app reads the token from `data/dev-token` and asks `POST /api/enter-nonce` for a one-time pass (30 seconds, used once);
  the window opens `/api/enter?n=<pass>`, which sets the cookie. The token is never in a command line or an address, and `/api/enter` answers only for `127.0.0.1` / `localhost` hosts (DNS rebinding).
- **Start of the hub** (`src/index.ts`): the program's files are copied into the workspace, the app's Blender (`data/tools/bin/blender`, `blender-run`) is put on the `PATH`,
  and a `VoiceSupervisor` starts VoiceStudio if nothing answers on its port, restarts it when it stops (up to 5 times in a row) and stops it with the hub.
- **First-run setup** (`src/setup/`, `src/routes/setup.ts`, `web/pages/Setup.tsx`): pure checks of the machine (`checks.ts`), the voice modes (`voice-modes.ts`), a step runner with a log per step (`installer.ts`),
  and the steps: workspace packages (`npm ci`; an empty root-owned `node_modules` left by the old Docker setup is removed first), Blender (pinned tarball with SHA-256), VoiceStudio (git clone of a pinned tag, `uv sync`, the engine, the model, engine selection; the server is stopped at the end).
  Everything VoiceStudio writes stays in `data/tools/voicestudio/` (its own `HOME`), so deleting that folder removes the voice.
- **Voice models** (`src/setup/voice-catalog.ts`, `voice-engines.ts`, `src/routes/setup-voice.ts`, `web/pages/SetupVoice.tsx`, also in Settings): only voice (TTS) models; transcription and language models are not used.
  VoiceStudio's reviewed-install path (`/models/install/prepare` and `commit`) blocks every voice model of this version (its review of licences and sources is not finished), so the download uses
  `POST /models/install`, the call its own settings screen uses, after the person ticks that they read the licence (the server refuses without it). Progress comes from `/models/install/status`.
  A voice is chosen with `POST /engines/select`; the voice in use cannot be removed.
- **Not packed in the app:** Blender, VoiceStudio and its models are downloaded at first run into `data/tools/`.


## What it is for

A web platform that is up while the app is open or in the tray. Everything lives under `platform/` of the repository. It lets one person:

- run a **Claude session inside the page** (a terminal running Claude Code with their own login);
- have a **browser that schedules reels on Instagram in the background**, with a progress bar;
- make whole reels (voice, Blender, Remotion, ffmpeg, whisper.cpp);
- change a finished reel by talking to Claude;
- see and approve everything in one place, for **several brands**, each with its own pages and data.

## Fixed facts

- **It runs as you.** The hub, the voice server and the jobs are your processes, with your files. Paths in skills, scripts and logs are the real paths.
- **Claude login:** the user's own (`~/.claude`), no API key. The hub runs the `claude` command; the app gives the hub a `PATH` that includes `~/.local/bin`.
- **Instagram login:** done by the user in a Chromium window on the desktop. Nobody types the password for them. The login state and the button that opens the window are in **Settings > Instagram**; there is no Instagram page.
  Reads (session check, calendar) run in a headless browser; the login and the schedule flow use a window. The browser profile is `<data>/brands/<slug>/profile/`, always inside the brand's own folder.
- **VoiceStudio** (uvicorn on 3900, with the engine the person chose) lives in `<data>/tools/voicestudio/`, installed by the setup from the official sources (a pinned tag, `uv sync`, VoiceStudio's own installer for the engine). Nothing is copied from elsewhere.
  Do not run another VoiceStudio next to it on a GPU of 8 GB: two copies of the model do not fit.
- **GPU is optional.** The voice mode chosen in the setup says where the voice runs. CPU modes work but the voice is slow.
- **Blender** 5.3 from the official tarball, installed by the setup into `<data>/tools/blender/`; `blender` and `blender-run` wrappers in `<data>/tools/bin/` are put on the `PATH` of the jobs. `BLENDER_DEVICE=cpu|gpu|auto` is a setting, not hard-coded.
- **whisper.cpp** is built in the workspace by the setup (`scripts/setup-whisper.mjs`), for this machine.
- **Security.** The hub gives a shell. It listens on `127.0.0.1` only and needs a token (`data/dev-token`, mode 600, never committed or printed). The app's window signs in with a one-time pass.
- **Where the state is.** In the studio folder, outside the program: the hub reads `HUB_DATA` (`<REEL_STUDIO_HOME>/data`) and works in `REEL_ROOT` (`<REEL_STUDIO_HOME>/workspace`, a Remotion project);
  the repository is only the program (`PROGRAM_ROOT`, installed in `/usr/lib/reel-studio`) and the hub copies its own files into the workspace at every start (`src/layout/`).
  **Changed:** the first design kept state in a Docker volume, then in `platform/data` inside the project folder; each brand became one folder in `<data>/brands/<slug>/`, with its Instagram login inside.

## Processes

1. The app (Electron): the window, the tray, the notifications.
2. `hub` (Node 22), started by the app: REST, server-sent events and WebSocket on port 4000.
3. `voicestudio`: uvicorn on port 3900, started and watched by the hub.
4. On demand: Blender, Remotion renders, headless Claude, Chromium for Instagram, spawned by the hub or by Claude.

## The hub: pages

The sidebar is fixed (it does not scroll with the page; in a window too short for it, it scrolls by itself). It has the brand switcher, one entry with an icon for each page (`web/nav.ts` lists the pages and draws their icons as plain strokes, with a test that none is missing), then a separator and the Claude usage block, Setup and Sign out, right below Settings.

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
| **Character** | The moves of the brand's character (PNG sequences in `<brand>/mascot/movements/<move>/`), add a move with Claude and Blender, re-render one. For a brand without one: the experimental character-from-a-picture steps (previews, then the moves). |
| **Settings** | Per brand: Instagram login, posting schedule, daily loop, factory rules, voice, delete brand. Global: Blender device, Claude model, brand assistant, which content skills are on. |
| **New brand** | The brand creator (see BRANDS.md). |

## Job model

All long work is a job. Fields: `id`, `type`, `brand`, `title`, `status` (`queued|running|done|failed|cancelled`), `progress` (0 to 1), `step`,
`steps`, `stepIndex`, `log`, `params`, `result`, `error`, timestamps. Types: `instagram.schedule`, `instagram.reschedule`, `instagram.delete`,
`reel.make`, `reel.edit` (one turn of the chat that changes a reel), `reel.ideas`, `daily.run`, `analytics.collect`, `reel.insights`, `series.plan`, `schedule.suggest`, `brand.create`,
`character.build`, `character.moves`, `blender.render`, `claude.task` (`voice.generate` is declared but not used by the hub).

API: `GET /api/jobs`, `GET /api/jobs/:id`, `POST /api/jobs`, `POST /api/jobs/:id/cancel`, `GET /api/events` (SSE), all behind
`Authorization: Bearer <HUB_TOKEN>` or the login cookie `hub_token`. `GET /api/health` needs no token. Brand-scoped routes are
`/api/brands/:slug/...`; the old `/api/...` paths answer for the first brand. Jobs persist in `jobs.json`; a job that was `running` at
startup becomes `failed: interrupted`.

**Lanes.** Jobs run in lanes: `instagram` (one at a time, across all brands), `voice`, `factory` (concurrency per brand, default 2),
`ideas`, `daily`, `analytics`, `brand`, `character`.

## Instagram scheduler (`platform/hub/src/scheduler`)

Playwright (the system Chromium, headless for reads and with a window for the login and the schedule flow, persistent profile per brand) doing what was first done by hand. The flow on
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
(`<data>/brands/<slug>/profile/`). Global settings (Blender device, Claude model, brand assistant)
stay in `<data>/settings.json`. The job queue is shared (one browser flow at a time); each job carries `brand`.
A workspace from before the one-folder-per-brand layout is moved with `scripts/migrate-brand-folders.sh` (copies and checks, removes nothing unless asked). More in [BRANDS.md](BRANDS.md).

## Code layout

- `platform/hub/src/` server (Fastify), one folder per area: `jobs`, `factory`, `ideas`, `daily`, `calendar`, `analytics`, `series`, `brands`, `creator`,
  `character`, `scheduler`, `routes`, `shared` (types used by the web app too).
- `platform/hub/web/` the React app (`pages`, `components`, `creator`).
- `platform/hub/tests/` and `platform/hub/src/scheduler/test/` the tests (hub: 55 files, 498 tests; the scheduler is tested end to end against a mock page).
- Test fixtures stand in for Claude and for the scheduler (`tests/fixtures/fake-*.mjs`); no test touches Instagram or Claude.

## Claude and Codex access, and the Claude usage (2026-11-23)

- **Access** (`src/claude/access.ts`, `src/routes/ai.ts`, `web/components/AiAccess.tsx`): per tool, `login` (default) or `api-key`. A key is validated by shape (`sk-ant-…`, `sk-…`), written to `data/<tool>-api-key` with mode 600 (atomically) and never returned (the state carries `keyHint`, the last four characters). `AccessStore.apply(env)` returns a new environment: the tool's credential variables removed, then the key set in API-key mode (Claude also gets `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`).
- **Where it applies:** `env.ts` has one environment layer per tool (`setEnvLayer`). `jobEnv` (every Claude job: make, edit, ideas, daily, analytics, character) and the terminal apply the Claude layer; the brand assistant applies the Claude layer for `claude` and the Codex layer for `codex`, and a custom command gets no Anthropic key. The layers are set in `app.ts` from the two stores, so a change reaches the next run with no restart.
- **Secrets are not readable by jobs:** `claude-safety.ts` denies `Read` of `**/dev-token`, `**/claude-api-key` and `**/codex-api-key`.
- **Usage** (`src/claude/usage.ts`): `runProcess` calls a tap with every stdout line that contains `rate_limit_event` or `total_cost_usd` (whichever job it comes from; a failing tap never breaks a job). `parseUsageLine` reads the session (`unifiedWindows.five_hour`) and week (`seven_day`) windows (utilization 0 to 1, `resetsAt`) and the cost of a `result`; `UsageStore` keeps the latest windows (a window missing in a later event keeps its value) and the cost per day (35 days) in `data/claude-usage.json`. The sidebar block (`AiUsage`) polls `GET /api/ai` every 30 s.
- **Check** (`POST /api/ai/:provider/check`): one small call in a neutral folder with the chosen access; for Claude it also refreshes the usage. One at a time, 90 s limit.
- **Not available:** a usage reading for Codex (nothing in its output), and a reading without any run (the numbers come from Claude's own events).

## Editing a reel by chat

The page of one reel has a conversation with Claude that changes the reel. Each message is one `reel.edit` job (`src/reels/edit-handler.ts`, lane `edit`, one at a time):

- **Context.** The first turn gets the whole picture: the reel skill, the style guide, the reel's folder, the character's moves that exist, and whether the reel is already scheduled (`edit-prompt.ts`). Later turns resume the same Claude session (`--resume <id>`, the id comes from the `init` line of the stream and is kept in the reel's `chat.json`), so only the request and the rules go. A session that cannot be resumed starts a new one with the full context.
- **Safety.** Before the run the reel (video, caption, cover, script, plan, props, `code/`) is copied to `<reel>/.versions/<time>/`, the newest three are kept (`versions.ts`). The tools are the ones of `reel.make` (voice, Blender and renders only through the slot queue; no git, no posting, no `rm -rf`), plus `--add-dir` of the brand folder. If the run fails, is stopped, or leaves the reel without MP4, caption or cover, the missing deliverables are put back from the snapshot and the chat says so.
- **Rules of the request** (`createSchema`/`editSpec`): the reel must exist; a reel with a change queued or running, or one being scheduled on Instagram, is refused (409); the message is 1 to 4000 characters.
- **The conversation** is `<reel>/chat.json` (the last 200 messages, written atomically); the page shows a message whose job has not started yet from the job's own params. The video address carries a version (the MP4's time and size), so a new render loads at once.
- **Undo.** The page lists the versions (`GET /reels/:folder` returns `versions`) and `POST /reels/:folder/restore {version}` puts one back (`restoreVersion`): the saved video, caption, cover, script, plan, props and code replace the current ones (files the change added to `code/` are removed, the audio is left alone), after the reel as it is now is saved, so an undo can itself be undone. It is refused while a change or a schedule of the reel runs.
- **Not done:** editing the script's audio by hand, several reels in one conversation.

