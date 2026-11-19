# Reel Hub: design (decided with the user, 2026-11-19)

A web platform that is always up in Docker. One container (`reel-hub`), restart policy `unless-stopped`, Docker already
enabled at boot. Everything lives under `platform/` of the repository.

## What the user asked for
- A web app with a **Claude session inside it** (a terminal in the page running Claude Code, using the user's own login).
- A **browser that posts to Instagram in the background**, with a **progress bar**.
- A **page to see the character (the brand's character) and add things/details to him with Claude and Blender**.
- The container must **contain Blender and VoiceStudio** (and what the `reel` skill needs: node, remotion deps, ffmpeg,
  whisper.cpp), so the whole reel pipeline runs in it.
- **Blender device is a setting** (cpu | gpu), not hard-coded.
- Claude login: **the user's own login** (mount `~/.claude` and `~/.claude.json`), no API key.
- Instagram: the first login is done **by the user** in a remote browser window (noVNC) inside the webapp. Nobody types
  their password for them. The profile persists in a Docker volume.

## Fixed facts
- The container runs as the **host user** (name, uid, gid from `.env`, written by `install.sh`) and mounts the project, `~/.claude`
  and `~/.claude.json` at the **same absolute paths as on the host**, so every path in skills, scripts and logs is valid inside
  and outside. The user is created at container start by `platform/docker/entrypoint.sh`; `mascot/<character>.py` finds the project
  root from its own file location.
- Optional bind mount: `BLOG_DIR` / `BLOG_MOUNT` (read-only), a folder of source texts for the idea jobs.
- VoiceStudio: backend `uvicorn main:app --app-dir backend --host 127.0.0.1 --port 3900` run from
  `~/.config/VoiceStudio/runtime/project` with its own venv (`.venv`, 9.4 GB, CUDA wheels inside, uv-managed Python
  3.11 in `~/.config/VoiceStudio/runtime/.python`). Models and data in `~/.omnivoice` (8 GB, engine `voxcpm2`).
  Env it needs: `OMNIVOICE_PORT=3900 CUDA_VISIBLE_DEVICES=0`. In the container these two folders live in **named Docker
  volumes filled at first start from the official sources** (`platform/docker/voicestudio-run`: git clone of the pinned tag,
  `uv sync`, then VoiceStudio's own sidecar installer for the VoxCPM2 engine). Nothing is copied from the host. Do not run a
  host VoiceStudio next to it on a small GPU (8 GB: two copies of the model do not fit).
- GPU: one RTX 5050 Laptop, 8 GB, driver 615.x, Docker has the `nvidia` runtime. Use `runtime: nvidia` /
  device reservation in compose.
- Blender: the host uses the flatpak 5.3 with `-b -P <project>/mascot/<character>.py -- move <name>`;
  engine is Workbench with flat lighting. In the container install Blender 5.3 from the official tarball; headless
  Workbench needs a GL context: `BLENDER_DEVICE=gpu` uses the NVIDIA EGL/GL, `cpu` uses software GL (Mesa llvmpipe under Xvfb).
- Host glibc is newer than Ubuntu's: **do not copy host-built native binaries** (whisper.cpp must be rebuilt in the image,
  `node_modules` prebuilt wheels are fine).
- Security: the hub gives a shell. Publish only on `127.0.0.1`, and require a token (`HUB_TOKEN`, generated into
  `platform/.env`, never committed or printed in chat).

## Services inside the one container (supervisord)
1. `hub` (Node 22): REST + SSE + WebSocket on port 4000.
2. `voicestudio`: uvicorn on 3900.
3. `display`: Xvfb :99 + x11vnc + noVNC (websockify) for the Instagram login window; Chromium runs in it.
4. (on demand) Blender, Remotion renders, Claude: spawned by the hub or by Claude.

## Hub app: pages
1. **Jobs** (home): list of jobs with a progress bar each (live via SSE), log tail, cancel.
2. **Claude**: xterm.js terminal over WebSocket, backed by node-pty running `claude` in the project folder inside tmux, so
   it survives page reloads. Starts as the user's normal interactive Claude Code.
3. **Reels**: every folder in `reels/<brand>/<n>-<name>/` with mp4 / caption / cover status, and an **Instagram schedule**
   status; button "Schedule" opens a slot picker and creates an `instagram.schedule` job.
4. **Instagram**: session status (logged in or not), the noVNC window to log in, and the schedule queue.
5. **Character (the brand's character)**: gallery of every move (PNG sequences in `public/mascot/<move>/`, `f-NNNN.png` mouth closed,
   `o-NNNN.png` open, `info.json`), animated preview, list of moves and faces, and a box **"Add to <character> with Claude"**
   that runs a headless Claude job (prompt + context: `mascot/<character>.py`, `src/mascot/Mascot.tsx`, the reel skill rules for
   adding a move) which writes the new `m_<name>` function, registers it, renders it with Blender and shows progress;
   also a button to re-render one move.
6. **Settings**: Blender device (cpu | gpu | auto) saved in `platform/data/settings.json`, Claude model, Instagram
   account name, schedule slot pattern. Read by the hub and exported as env to spawned processes.

## Job model (shared by all parts)
```json
{ "id": "uuid", "type": "instagram.schedule | blender.render | claude.task | voice.generate",
  "title": "Reel 9 · Fri 20 17:30", "status": "queued|running|done|failed|cancelled",
  "progress": 0.0, "step": "Uploading cover", "steps": ["Open dialog","Upload video","Crop 9:16","Upload cover","Caption","Date and time","Schedule","Verify"],
  "stepIndex": 2, "log": ["..."], "startedAt": "...", "finishedAt": null, "result": {}, "error": null }
```
API: `GET /api/jobs`, `GET /api/jobs/:id`, `POST /api/jobs` (`{type, params}`), `POST /api/jobs/:id/cancel`,
`GET /api/events` (SSE: `job` events with the full job object), all behind `Authorization: Bearer <HUB_TOKEN>` or the
login cookie. Jobs are persisted in `platform/data/jobs.json` (survive restarts; a job that was `running` at startup
becomes `failed: interrupted`).

## Instagram scheduler (module `hub/src/scheduler`)
Playwright (Chromium, headed on the Xvfb display, persistent profile in the volume `/data/chrome-profile`) doing what was
done by hand through Claude in Chrome. Proven flow on `https://www.instagram.com/scheduled_content/`:
1. Button **Schedule content** (top right) opens "Create new post". The file input is the only `input[type=file]` in the
   dialog: set the reel's MP4 (`setInputFiles`). Wait for the "Crop" step.
2. **Crop step: always 9:16.** Click the zoom/aspect icon at the bottom left of the preview, choose `9:16` (options:
   Original, 1:1, 9:16, 16:9). Then `Next`.
3. **Edit step**: the cover file input is the `input[type=file]` under "Cover photo": set `cover.png`. Then `Next`.
4. **Caption step**: the caption is `div[contenteditable=true][role=textbox]`; type the whole `caption.md` (keep line
   breaks and emoji, plain `#`). Verify: `innerText.length` equals the file's length plus the number of characters above
   U+FFFF (Instagram counts each emoji twice), the text ends with the same last hashtag, no `%23`.
5. **Date and time** (the "Schedule content" toggle is on): date is a button (`Thu, Nov 19, 2026`) that opens a month
   picker; pick the day. Time is three spinbuttons labelled `Hours`, `Minutes`, `AM PM`: click each and type (`04`, `30`,
   `P`); one string does not work. Instagram refuses a time less than 20 minutes ahead. Read the values back.
6. Press **Schedule** (top right of the dialog; never the "Share" button of the edit view, it publishes at once). Wait up to
   ~30 s for "Your reel has been scheduled.", then `Done`.
7. **Verify** on the calendar page: reload, find the post at that day and time (caption start matches). Fail the job if
   missing or duplicated. Never schedule the same reel twice (state file per reel in `platform/data/scheduled.json`).
Rules: 9:16 always; one reel at a time (sequential queue); a failed step stops the job with a screenshot saved in
`platform/data/shots/`; never enter credentials: if the page shows the login form the job fails with `login_required`.
Slot pattern (setting): Sun/Tue/Thu 08:00, 16:30, 19:00; other days 07:30, 17:30; timezone Europe/Rome.

## Ownership (parallel work, do not edit another part's files)
- `platform/docker/` + `platform/docker-compose.yml` + `platform/.env.example` + `platform/README.md`: infra.
- `platform/hub/` except `src/scheduler/`: hub (backend + React frontend).
- `platform/hub/src/scheduler/`: scheduler (exports `runScheduleJob(job, ctx)`, `getSessionStatus()`,
  `openLoginWindow()`; `ctx` has `update({progress, step, stepIndex, log})`, `signal` (AbortSignal), `settings`).

## Factory (reel.make), added 2026-11-19
The hub imports `brand/<brand>/reel-questions.md` (`GET /api/factory/questions`, parsed on every request, joined with the
reel folders and `data/scheduled.json`). The Factory page selects to-do questions and creates one `reel.make` job each.
- **Job**: headless `claude -p` (via `HUB_CLAUDE_BIN`) in `REEL_ROOT`, prompt built from `.claude/skills/reel/SKILL.md` with
  approvals waived; Bash allowed except `rm -rf`, `git`, `docker`, `systemctl`, `kill`. Voice, Blender and renders must go
  through `bash scripts/slot.sh voice 1 --`, `... blender 1 --`, `... render 3 --`. Never schedules on Instagram.
  Steps: Script, Voice, Plan, Build, Render, Checks, Caption, Cover, Done (from tool calls and files appearing). It fails
  with the last error if mp4, caption.md and cover.png are not all present. Concurrency: `factory.concurrency` (default 2).
- **Folder**: `<next free n>-<short-name>` allocated under a lock and created at once, so parallel jobs never collide.
- **Ticking**: on success the hub (not Claude) ticks the question under a lock and adds the folder and `closing A|B`.
- **Automatic closing** (`src/factory/classifier.ts`, keyword lists in `data/settings.json` under `factory.closingRules`,
  editable in Settings; overridable per row): the question text decides first. Any product keyword in the question gives
  **A** (the brand's closing A: qr, digital/paper/printed menu, price, translate, kitchen screen/display, order mistakes or
  errors, set up, app, paper, going digital, 2010). Otherwise any general keyword gives **B** (Follow for tips: allergen,
  rules, law, review, google, marketing, staff, rota, lunch rush, tourists, languages, number of). If the question matches
  nothing, the source slug is scored the same way and A needs strictly more product than general hits. Ties and no match: B.
  Keywords match whole words; a trailing `*` matches word starts.
  Known examples, all reproduced by a unit test: B = 7, 8, 10, 13, 14, 20, 21; A = 9, 11, 12, 15, 16, 17, 18, 19.

## Brands (multi-brand hub)

Everything brand-specific is scoped to one brand: `brand/<slug>/brand.json` (zod-validated, `platform/hub/src/brands/schema.ts`),
`platform/data/brands/<slug>/` (settings, daily plans, analytics, ideas, series, scheduled.json, locks, notifications) and the
Instagram browser profile (`/data/chrome-profile/<slug>/`, or the folder named by `instagram.profileDir`). Global settings (Blender
device, Claude model) stay in `platform/data/settings.json`. The job queue is one for all brands (one browser flow at a time);
each job record carries `brand`. API: `/api/brands/:slug/...`; the old `/api/...` paths answer for the first brand.
Web: `#/<slug>/<page>`, brand switcher in the menu. First start after the release: `platform/hub/src/brands/migrate.ts` makes a
backup (`platform/data/backup-pre-brands-<time>/`) and moves the single-brand data into the brand folder (idempotent, logged).
