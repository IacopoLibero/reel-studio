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
  uninstall, compose, CI and docs follow the new layout. Not tried yet on it: a real Instagram schedule, a reel made end to end, a voice. Leftovers on the host in the repository, safe to delete once you are sure: `node_modules/` (927 MB) and `whisper.cpp/` (1.6 GB),
  both rebuilt in volumes by the container; the 15 disabled `reel-post-*` units in `~/.config/systemd/user/` (an old posting method, they point at a path that no longer exists).
- **Closing keywords in the brand creator (required).** The interview must propose the closing keywords (`factory.closingRules`, product and general lists) from the brand's products, and the user confirms or edits them before the brand is created. Today it does not: they are added by hand in Settings after the brand exists. Defaults are empty, so a brand without keywords gets closing B on every reel.
- **Voice step in the brand and character creator (required).** Today the creator makes no voice: the user must already have a sample (`voice.wav` plus its words), reuse one from another
  brand, or skip it. The step should offer two ways: (1) **Claude proposes a few example voices** from the brand's tone and character (a short description for each, the `instruct` text), and a `voice.generate` job
  makes each one with VoiceStudio (`POST /generate` with `instruct`, no `ref_audio`); the user listens and picks one directly, and the picked audio and its words are saved as the brand's voice sample
  (`voice/voice.wav`, `voice/voice.txt`); (2) the user uploads a sample as today. Needs VoiceStudio running (`scripts/ensure-voice.sh`), a way to play and re-roll the candidates, and a test with a stand-in Claude
  and a stand-in voice server. This is how Forky's voice was made by hand.
- **The job type `voice.generate` stays**: it is declared (type, queue lane, daily gate) but no handler creates it yet. It becomes the job of the voice step above: Claude proposes the example voices and the job makes them with VoiceStudio. Voices for reels are still made inside `reel.make` by `scripts/voice.mjs`.
- **Brand creator polish:** edit a brand's colours, fonts and closing lines in the hub after creation (today: edit `brand.json`); a "first reel" shortcut that proposes ten
  starting questions right after creation (today: "Find new ideas" in the Factory).
- **Retake the screenshots** in `docs/images/` when a page changes visibly (see CONTRIBUTING.md). The Reels page changed (Posted and yellow Scheduled badges).

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
