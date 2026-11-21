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

**Fixed point: Reel Studio becomes a standalone app** (a Flatpak and a pacman package) instead of a cloned repository plus Docker. The goal is stable data: brands, reels, settings,
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
- **Logo in Settings (2026-11-21):** the "Colours, fonts and closings" card has a Logo row (preview in the cover frame, choose file, remove) backed by `GET/PUT/DELETE /api/brands/:slug/logo`; PNG only, up to 1 MB, saved at once. Open: the New brand page still accepts an SVG logo, but covers and reel closings load `public/logo.png`, so an SVG is never drawn. Make both PNG only, or teach the kit to load an SVG.
- **Review of the day's changes (2026-11-21):** done with the code-reviewer; fixed the stale brand list after a style or logo save, the font check on `PUT /style`, the logo sentence of `style.md` (kept true when a logo is set or removed), a leftover `logo.svg`, the font preview getting stuck, and two small UI cases. Not done: the repository lint (`npm run lint` needs the root `node_modules/`, which was removed), and a kicker on a cover without a logo has not been looked at.
- **Cleanup after the layout change (2026-11-21, done):** the old `workspace/public/r7` to `r21` folders (the five reels that still pointed to them, 10, 11, 12, 17 and 18, now point to the `<n>-<name>` copies, which were byte-identical; the studio defaults in `src/r*/Root.tsx` follow), the pre-brands backup and both migration markers in `data/`, the leftover voice samples in `data/tmp-uploads/`. Kept on purpose: `data/settings.json` (live global settings), `data/tmp-uploads/` itself (the hub's scratch folder), `platform/.env` (the host notifier reads it).

### 2. The app

- **Packages.** A pacman package (declares its dependencies) and a Flatpak. Models and other heavy files never go inside the package: they are downloaded on first run into the data folder.
- **Blender and VoiceStudio are managed by the app, not packed in it** (leaning, to confirm): the app installs or finds them, starts them and checks they answer. Blender can come from its own Flatpak; VoiceStudio
  (Python, GPU, about 27 GB of models today) is the hard part inside a Flatpak sandbox, so test the GPU path early. Claude Code and Chrome (Instagram scheduling) also need to work from the sandbox.
- **Delete brand** leaves the Instagram login in place when it cannot be moved cheaply (another volume, or a custom `instagram.profileDir`): remove that profile folder by hand.
  In the app each brand's login lives inside the brand's own folder, so deleting the brand removes it.
- **Desktop notifications.** `scripts/install-notifier.sh` installs the host unit for the Docker setup; the app sends its own notifications and that script goes away.
- **Backups** stay a README recipe until then; with one data folder they become copying that folder.
- **Updates and first run.** The Remotion agent skills are fetched at first run and on update; the data folder is never touched by an update.
- **Docs and tests.** Rewrite the install and operations parts of the README and `platform/README.md` for the app; keep the Docker setup only if it is still wanted.

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
