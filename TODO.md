# TODO

What is still open, on purpose. Move an item out of this file when it is done. Last update: 2026-11-20.

## Before publishing


- **Check the history before each push.** On 2026-11-20 the check found one accepted trace: a `slugify` test example with the first brand's name in commit `f68b314` (already public, left as is on purpose). Before any new push repeat `git log --all -i -S<word>` for each private brand (also the name spelled with several spaces) and confirm nothing else appears.

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

## Later

- **Character from a picture** (`character.build`): built as an experiment (plan, Blender script, flat previews with approval and notes) and only run with a
  stand-in Claude so far. Not done: running it for real with Claude and Blender on a real sheet, and turning an approved preview into the moves reels use
  (talk, wave, expressions, `public/mascot/<move>/` frames, the Remotion component). A fully automatic character from any picture is future work.
- **Assistants `codex` and custom command** for the brand interview follow the generic stdin and stdout interface and were tested only with a stand-in command.
  They get no tool limits from the hub. Try them with the real tools and fix the default `codex exec -` if needed.
- **Full-width `Stage` variant of the Remotion kit** and a generic scene toolkit: `src/kit` has only the theme and captions. Reels for a brand without a character rely on the
  `reel` skill composing full-width scenes from them.
- **Delete brand** leaves the Instagram login in place when it cannot be moved cheaply (another volume, or a custom `instagram.profileDir`): remove that profile folder by hand.
- **Closing keywords in the brand creator (required).** The interview must propose the closing keywords (`factory.closingRules`, product and general lists) from the brand's products, and the user confirms or edits them before the brand is created. Today it does not: they are added by hand in Settings after the brand exists. Defaults are empty, so a brand without keywords gets closing B on every reel.
- **Brand creator polish:** edit a brand's colours, fonts and closing lines in the hub after creation (today: edit `brand.json`); a "first reel" shortcut that proposes ten
  starting questions right after creation (today: "Find new ideas" in the Factory).

- **Stories** (`ootto-story-sequencer`), **carousels** (`ootto-carousel-builder`, `ootto-viral-carousel`) and **paid campaigns** (`ootto-paid-social-brief`,
  `ootto-utm-campaign-plan`): the skills are installed but the factory only makes reels. Each needs its own page, job and scheduler flow. They are visible in Settings and off.
- **Backup script.** `platform/README.md` shows how to back up by hand (project data and the `chrome-profile` volume). A `scripts/backup.sh` (and a restore) would make it one command.
- **Host notifier unit.** `scripts/reel-hub-notify.sh` is in the repository but the systemd user unit that runs it is not; add it (or a `scripts/install-notifier.sh`) so the desktop alert of the daily loop is one command.
- **Dead settings.** `platform/docker-compose.yml` and `supervisord.conf` set `HUB_DATA_DIR=/data`, which nothing reads (the hub uses `HUB_DATA`, default `platform/data`), so the volume
  `hub-data` is unused; remove both, or point the hub at it on purpose. The job type `voice.generate` is declared but no handler creates it.
- **Daily page nit:** the day picker is too narrow and cuts "(today)".
- **Retake the screenshots** in `docs/images/` when a page changes visibly (see CONTRIBUTING.md).

## Known limits

- `reel.make` keeps a broad shell (voice, Blender and render need it). It cannot read credential files or use curl, wget, ssh or `env`, but a script written from scratch could still read other
  files in the project. Accepted for now.
- The hub reads only the project and local Claude settings inside the container, because the host's user hooks and plugins hang headless Claude there (the `claude-hub` wrapper).
- Remotion agent skills are fetched from upstream at install time; if upstream is unreachable the install continues without them and prints how to retry
  (`scripts/install-remotion-skills.sh`).
- Docker disk use: the image is about 8 GB and rebuilds leave old layers (tens of GB over time). Run `docker image prune` now and then.
- The offer rule only changes the Instagram copy of a caption (`caption.md` stays as it is). After a brand's last offer day, update the offer text in its `style.md` by hand and check the next closing-A reel.
- Instagram scheduling: about 30 days ahead, at least 20 minutes of lead time, 9:16 only, one browser job at a time across all brands.
