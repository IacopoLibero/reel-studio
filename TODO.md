# TODO

What is still open, on purpose. Move an item out of this file when it is done. Last update: 2026-11-20.

## Paused

- **Threads.** Posting needs your own Meta app (Composio asks for a client id and secret, plus the redirect URL it shows).
  Steps: developers.facebook.com, create an app with the Threads API use case, permissions `threads_basic` and `threads_content_publish`, add Composio's redirect URL
  to the allowed list, add the account as a Threads tester, then paste the Threads App ID and secret into the Composio form (`composio link threads`).
  Until then Settings > Daily loop > "Threads text" stays off, `reel-threads` and `x-thread-strategy` are off, and nothing is posted.
  (The Threads API is free; Composio has its own monthly quota on its free plan.)

## Waiting for data (nothing to build, just time)

- **Best posting times** (Calendar > "Suggest best times"): needs 8 or more reels with plays at least two days old. Then compare the suggestion with the slot pattern.
- **Hook mining** (`ootto-hook-mining`): needs 8 or more rows in a brand's `analytics/hooks.csv`. The daily loop turns it on by itself once the file is big enough.
- **Series flow with real Claude.** Creating, assigning and "Plan a series" are covered by tests and render with seeded data, but were not clicked through with a real Claude run.
- **Ideas panel** (Factory > Find new ideas): Accept and Reject were only tested on temporary copies, not clicked on a real list.
- **Daily loop, repeated runs.** Check on real runs that `reel.make` calls `reel-hooks` (the job log shows `SKILL CALLED`) and review the improvement proposals in
  `platform/data/brands/<slug>/daily/<date>.json` (none is ever applied by the hub).

## Roadmap

**Fixed point: Reel Studio becomes a standalone app** (a pacman package; a Flatpak is probably not worth it, see below) instead of a cloned repository plus Docker. The goal is stable data: brands, reels, settings,
the Instagram login, voices and analytics live in one folder outside the app, so updating or reinstalling the app never touches them. The order is: small things first (in the current Docker setup),
then the app, then the big features, which are born with the final structure and are not moved twice. The data restructure is done.

### 1. Before the app (in the current setup)

- **Data restructure: done (2026-11-20).** Everything of yours is in `~/ReelStudio` (`workspace/`, `data/`); the repository moved there too (`~/ReelStudio/reel-studio`) and is only the program; the old copies and volumes are deleted; install, update, new-brand,
  uninstall, compose, CI and docs follow the new layout. Not tried yet on it: a real Instagram schedule, a reel made end to end, a voice. The old leftovers (`node_modules/`, `whisper.cpp/`, the `reel-post-*` units, the old session folders) are deleted.
- **Closing keywords and closing lines in the brand creator: done (2026-11-20).** The interview proposes the two closing lines from what the brand sells and the two keyword lists (`factory.closingRules`, product and general); the form and the interview review have a box for each list (one word per line, a trailing `*` matches any word starting with it); `brand.create` saves them in the brand's `settings.json`. Not tried yet with the real assistant on a new brand.
- **Voice step in the brand creator: done (2026-11-20).** The Voice card has a fourth choice, "Suggest voices for me": the `voice.generate` job asks the assistant for three voices that fit the brand (label, `instruct` text, a 30 to 45 word sample), VoiceStudio makes each one (`POST /generate` with `instruct`, no `ref_audio`), the WAVs are staged as voice uploads and the person listens and picks one (or asks for others; the new round avoids the ones already heard). The pick is sent as a voice upload with its words, so it ends up in `voice/voice.wav` and `voice/voice.txt` like a sample the person brought. Needs VoiceStudio running. Tested with a stand-in assistant and a stand-in voice server, and once for real (the job with the real assistant and VoiceStudio, in Italian: three distinct voices of 12 to 18 s). Not tried yet: the whole page in a browser, ending in a created brand.
- **Brand creator polish: done (2026-11-21).** Settings has a "Colours, fonts and closings" card (own Save button, `GET/PUT /api/brands/:slug/style`) for the colours, fonts and the two closing lines; new reels and covers use it at once, reels already made are not redrawn. After creating a brand the checklist has a "Propose 10 first questions" button that starts the ideas job and opens the Factory. Tried for real on a throw-away brand: the whole New brand page with "Suggest voices for me" down to a created brand, the ten proposed questions, a style change, and one reel made from zero (script, voice, render, cover with the new accent and font).
- **Screenshots retaken (2026-11-21):** `reels-list.png` (Posted and Scheduled badges) and `settings.png`, from a scratch hub with the invented Acme Bakery brand.
- **Tried on the new layout (2026-11-21):** a real Instagram schedule (reel 24 of the live brand, made from a random question, scheduled for Fri 27 Nov 07:30, verified by the scheduler), a reel from zero on a throw-away brand, the voice step down to a created brand.
- **Fonts and covers (2026-11-21):** the font list is read from the workspace's `node_modules` when the hub does not have the package (it was empty before: names were not checked), and every font field shows a live preview (loads the font from Google Fonts, needs internet). A new brand no longer gets the template's placeholder `logo.png`; a cover is drawn without the logo frame when `cover.json` says `"logo": false` (the reel skill says when).
- **Logo in Settings (2026-11-21):** the "Colours, fonts and closings" card has a Logo row (preview in the cover frame, choose file, remove) backed by `GET/PUT/DELETE /api/brands/:slug/logo`; PNG only, up to 1 MB, saved at once. The New brand page and the import take a PNG too (covers and reel closings draw `logo.png`, so an SVG was never drawn).
- **Review of the day's changes (2026-11-21):** done with the code-reviewer; fixed the stale brand list after a style or logo save, the font check on `PUT /style`, the logo sentence of `style.md` (kept true when a logo is set or removed), a leftover `logo.svg`, the font preview getting stuck, and two small UI cases. Not done: the repository lint (`npm run lint` needs the root `node_modules/`, which was removed), and a kicker on a cover without a logo has not been looked at.
- **Cleanup after the layout change (2026-11-21, done):** the old `workspace/public/r7` to `r21` folders (the five reels that still pointed to them, 10, 11, 12, 17 and 18, now point to the `<n>-<name>` copies, which were byte-identical; the studio defaults in `src/r*/Root.tsx` follow), the pre-brands backup and both migration markers in `data/`, the leftover voice samples in `data/tmp-uploads/`. Kept on purpose: `data/settings.json` (live global settings), `data/tmp-uploads/` itself (the hub's scratch folder), `platform/.env` (the host notifier reads it).

- **One folder per brand (2026-11-21).** `data/brands/<slug>/` (first made in `workspace/brand/<slug>/`, then moved into the data folder with `--into-data`) now holds `identity/` (brand.json, style.md, logo.png, and the voice of a brand without a character), `mascot/` (the character's script, model, sheet, head shape, voice and `movements/`) and `reels/` (one folder per reel, audio included). The question list moved to `data/brands/<slug>/reel-questions.md` (hub data); `voice-sample.md` is now `.claude/skills/reel/voice-sample.md`; the template is read from the program and no longer copied; `sfx/` is the common sounds folder (the four old sounds plus seven new ones, no licence text needed). The global `public/`, `mascot/`, `reels/` and `characters/` folders are gone from the design. Remotion gets a public folder per run, built for the brand out of hard links (`scripts/brand-public.ts`, used by `remotion.config.ts`). The failed-step screenshots (`shots/`) and the single-brand migration code are removed. `scripts/migrate-brand-folders.sh` moves an older workspace (copy, check by hash, `--remove-old` only with an identical new copy). Done on the real workspace: copied and verified, the hub reads it, two frames of reel 22 rendered from the new folders match the published video (mean difference 1/255).
- **A file lost and rebuilt (2026-11-21).** `mascot/work/head.json` (the traced head of the example character, read by its Blender script when it builds the model) was deleted by mistake; the script that made it was deleted too. It was rebuilt from the rendered frames (the head outline, 1 sheet pixel = 2 frame pixels) and checked by rendering five frames of five moves: 99.5% of the silhouette matches, only anti-aliasing differs. It is stored as `mascot/<id>-head.json`. If the original character sheet turns up, trace the head again from it.
- **Open after the move:** the old copies (`workspace/brand/<slug>/*.json|md|png`, `reels/`, `mascot/`, `characters/`, `public/`, `brand/_template`) are still on disk until `scripts/migrate-brand-folders.sh --remove-old --yes`. A character added to a brand later (there is no screen for it yet) should move the brand's own voice from `identity/` to `mascot/<id>-voice.*`.

- **Ootto skills read from the program (2026-11-21).** `workspace/platform/skills` is gone: `.claude/skills/ootto-<name>` links to the program's `platform/skills/ootto/<name>` (absolute from a workspace; `scripts/ootto-skills.sh` uses `REEL_PROGRAM` or `programRoot` in `.reel-studio/program.json`), and `syncProgram` points the links at the program again at each start. Tried with a real headless Claude call that loads `ootto-hook-mining` and reads `mine_hooks.py` next to it.

### 2. The app

**Done (2026-11-22), tried on this machine:**

- **Pacman package** (`packaging/arch/`: `PKGBUILD`, launcher, desktop entry, icon) that depends on `electron` and the system programs; the studio folder is never touched. Flatpak: dropped (the sandbox makes the GPU, Claude Code and Chrome harder).
- **Electron app** (`platform/desktop/`): window, tray (closing hides it), single instance, system notifications from the hub's own notification list, "Start at login". The window signs in with a one-time pass (`/api/enter-nonce`, `/api/enter`).
- **The hub runs without Docker:** copies the program's files into the workspace, puts the app's Blender on the PATH, starts and watches VoiceStudio.
- **First-run setup screen:** checks, install buttons with logs (video packages, whisper.cpp, Blender, VoiceStudio), voice modes, voice models (licence first, progress bar, choose, remove, cancel; also in Settings > Voice). Blender and VoiceStudio are installed by the app into `data/tools/`, not packed.
- **A reel made end to end on the app** (Acme Bakery, voice VoxCPM2 on the GPU, 22 Nov): MP4 1080x1920 with audio (41 s), caption, cover without a logo frame, storyboard. The first run stopped at the word timing because whisper.cpp was missing (an empty root-owned folder from Docker); that is now a setup step (build tools + whisper.cpp and its model). The question was ticked in `reel-questions.md` with the right folder; the stopped first run left `4-freezing-sliced-bread-really-make/` (script and audio only) next to the finished `5-...` because a job made by the API ignores `rerunFolder`: delete the folder by hand.

**Open:**

- **No Instagram page (2026-11-22):** the login and its state are in Settings > Instagram (status, "Check again", a button that opens a Chromium window); the page, its nav entry and the embedded noVNC window are gone. In Docker the login window is at `/novnc/vnc.html`. The queue is in Jobs and the scheduled reels in Calendar and Reels.
- **Instagram browser on the desktop (2026-11-22):** reads (session check, the calendar, reschedule, delete) run in a headless Chromium, so no extra window opens when a page is looked at (it did on every start: the Calendar page read Instagram in a visible window); only the login window and the schedule flow have a window (the schedule flow starts minimized). Tried on the live login of easyrestaurant: the session is kept, the calendar of 12 weeks is read in about 6 s, no window. Docker keeps the old behaviour (a window on its virtual screen). Not tried: a real schedule from the app (headed, minimized).
- **Instagram on the app:** the login window opens as a Chromium window on your desktop with the brand's own profile (`data/brands/<brand>/profile/`): the system Chromium is used (`CHROME_PATH` overrides). Tried: the window opens and the session check runs (not logged in). Not tried: logging in as a person, a real schedule and its verification on Instagram's calendar from the app. The old login of the live brand lived in a Docker volume that was deleted: log in again once.
- **Reel code in the brand folder: done (2026-11-22).** A reel's code is in `<brand>/reels/<n>-<name>/code/` and what several reels share in `<brand>/code/`; the reels reach the kit by `@kit/...` and `@cover/...` (aliases in `remotion.config.ts` and `tsconfig.json`, which also type-checks the brands' code from the workspace). The reel skill and the make prompt say so.
  Moved: easyrestaurant `r7`..`r24` to reels 7..24, the shared Forky library (`a1 b1 c1 d1 e1 f1 f3 forky mascot`, and `Root.tsx`/`index.ts` for the first reels 0 to 6) to `easyrestaurant/code/`; acme-bakery `r-bread`, `r-dayold`, `r-halfloaf3`, `r-freeze5` to reels 0, 1, 3, 5 and the shared `Parts.tsx` to `acme-bakery/code/`. Stills of 6 reels rendered before and after were byte-identical, and a new reel made by the hub (Acme Bakery reel 6, 47 s, voice on the GPU) put its code in its own `code/` folder, reused `<brand>/code/Parts.tsx`, left the workspace `src/` untouched and type-checks. The orphan `r-halfloaf` (its reel folder was deleted) and `Root.private.tsx` are gone; the old copies were removed from the workspace after the check (a backup of `src/` was kept in the session's scratch folder only).
  Not done: the moved code keeps its own history of naming (`r7`, `a1`...): it works, rename later if it gets in the way. The reels 0 to 6 of easyrestaurant have no code folder of their own: they render from `easyrestaurant/code/index.ts` (compositions `FK1`..`FK6`, `A1`..`F3`).
- **`scripts/` stays in the workspace on purpose:** the Node scripts (`voice.mjs`, `transcribe.mjs`) import Remotion packages and find `whisper.cpp`, both in the workspace, so they run from there. It is a copy the program refreshes at every start, not your data; the skills call it as `bash scripts/slot.sh`.
- **Remotion agent skills:** a setup step fetches them (`scripts/install-remotion-skills.sh`) and the setup shows whether they are there. Not run as a step from the app (the workspace already had them); refreshing on update is by pressing the step again.
- **Desktop (COSMIC, Wayland), tried 22 Nov:** the tray item registers with the desktop's StatusNotifier watcher; a hub notification arrives as a system notification (seen on D-Bus, app name "Reel Studio" after the fix); the "Start at login" entry is valid (`desktop-file-validate`). The installed build left the hub running when the app was killed: fixed (signals stop the hub), tried under a virtual display. Not seen by eye: the tray icon and the notification pop-up, the tray menu clicks, the window on COSMIC.
- **Package:** `makepkg` builds from the last commit, the version is fixed at `0.1.0-1` (raise `pkgver` for a release); no `namcap` run; the dependency list (`gcc`, `make`, `uv`, ...) is not checked on a clean system.
- **Delete brand** leaves the Instagram login when it cannot be moved cheaply (a custom `instagram.profileDir`); in the app the login is in the brand's folder, so deleting the brand removes it: check it.
- **Docker setup:** still there and documented as the alternative; decide whether to keep it. `scripts/install-notifier.sh` and `reel-hub-notify.sh` are for it only.
- **Lint:** `eslint src && tsc` of the repository (kit and cover) run on 22 Nov on a clean copy with the workspace's packages: no findings. The hub has no lint, only `tsc` and tests. `shellcheck` is not installed here, so the shell scripts (and the new launcher, now in the CI line) were not checked.
- **Voice:** OmniVoice (CC-BY-NC) is not installed on purpose (non-commercial). Languages other than English and the choice of another voice per brand are not tried.

- **Fresh install from zero (before the big features):** build the package, install it on a clean system or user (a new `REEL_STUDIO_HOME`, a user without the tools), and go through the setup to a first reel. Checks the dependency list, the setup steps and the first-run text. Not done yet.

### 3. After the app (big, born with the final structure)

- **Character from a picture** (`character.build`): built as an experiment (plan, Blender script, flat previews with approval and notes) and only run with a
  stand-in Claude so far. Not done: running it for real with Claude and Blender on a real sheet, and turning an approved preview into the moves reels use
  (talk, wave, expressions, `public/mascot/<move>/` frames, the Remotion component). A fully automatic character from any picture is future work.
- **Assistants `codex` and custom command** for the brand interview follow the generic stdin and stdout interface and were tested only with a stand-in command.
  They get no tool limits from the hub. Try them with the real tools and fix the default `codex exec -` if needed.
- **Full-width `Stage` variant of the Remotion kit** and a generic scene toolkit: `src/kit` has only the theme and captions. Reels for a brand without a character rely on the
  `reel` skill composing full-width scenes from them.
- **Stories** (`ootto-story-sequencer`), **carousels** (`ootto-carousel-builder`, `ootto-viral-carousel`) and **paid campaigns** (`ootto-paid-social-brief`,
  `ootto-utm-campaign-plan`): the skills are installed but the factory only makes reels. Each needs its own page, job and scheduler flow. They are visible in Settings and off.

## Known limits

- `reel.make` keeps a broad shell (voice, Blender and render need it). It cannot read credential files or use curl, wget, ssh or `env`, but a script written from scratch could still read other
  files in the project. Accepted for now.
- The hub reads only the project and local Claude settings inside the container, because the host's user hooks and plugins hang headless Claude there (the `claude-hub` wrapper).
- Remotion agent skills are fetched from upstream at install time (in the app: at first run or update); if upstream is unreachable the install continues without them and prints how to retry
  (`scripts/install-remotion-skills.sh`).
- Docker disk use (only while the app runs in Docker): the image is about 8 GB and rebuilds leave old layers (tens of GB over time). Run `docker image prune` now and then.
- The offer rule only changes the Instagram copy of a caption (`caption.md` stays as it is). After a brand's last offer day, update the offer text in its `style.md` by hand and check the next closing-A reel.
- Instagram scheduling: about 30 days ahead, at least 20 minutes of lead time, 9:16 only, one browser job at a time across all brands.

- **Brand in the data folder, sounds and skills from the program (2026-11-21).** A brand is one folder, `data/brands/<slug>/`, with the hub's own data in it (question list, settings, schedule, Instagram login), so deleting the workspace loses no brand. `sfx/` and the Ootto skills are read from the program, not copied. The character's reference sheet is `mascot/studio/reference-sheet.png` (not read at run time). The reel skill chooses the character's moves only from `mascot/movements/`. Still in the workspace until the app: the reel code (`src/r*`) and `scripts/`.
