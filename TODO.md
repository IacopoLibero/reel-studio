# TODO

Everything we left behind on purpose. Move an item out of this file when it is done. Last update: 2026-11-19.

## Paused

- **Threads.** Posting needs the user's own Meta app (Composio asks for a client id and a client secret, plus the redirect URL it shows).
  Steps: developers.facebook.com, create an app with the Threads API use case, permissions `threads_basic` and `threads_content_publish`,
  add Composio's redirect URL to the allowed list, add the account as a Threads tester, then paste the Threads App ID and secret into the
  Composio form (`composio link threads`).
  Until then: Settings > Daily loop > "Threads text" stays off, `reel-threads` and `x-thread-strategy` are off, nothing is posted.
  (The Threads API itself is free. Composio has its own monthly quota on its free plan: check it in the Composio account.)

## Waiting for data (nothing to build, just time)

- **Best posting times** (Calendar > "Suggest best times"): needs 8 or more reels with insights. There are about 6. Then check the suggestion
  with a screenshot and compare with the slot pattern.
- **Hook mining** (`ootto-hook-mining`): needs 8 or more rows in `platform/data/analytics/hooks.csv` (it has 5 or 6). The daily loop turns it on
  by itself once the file is big enough.
- **Series page**: create and assign flow is not clicked through yet. Do it once there are reels worth grouping.
- **Ideas panel** (Factory > Find new ideas): the Accept and Reject buttons were only tested on temporary copies, not clicked on the real list.
- **Daily loop, second run**: the first real run (2026-11-19) made reel 23 and scheduled it. Check the next run for: `reel-hooks` really called by
  `reel.make` (it was not on the first run, now the prompt requires it and the job log shows `SKILL CALLED`), and review the 5 improvement
  proposals in `platform/data/daily/<date>.json` (none was applied; they only change `style.md` or the question rules if you say so).

## Brands (multi-brand hub)

- **Character from a picture** (`character.build`): built as an experiment (plan, Blender script and flat previews with approval and notes) and
  only run with a stand-in Claude so far. Not done: running it for real with Claude and Blender and iterating on a real sheet; turning an
  approved preview into the moves reels use (talk, wave, expressions, `public/mascot/<move>/` frames, the Remotion component). A fully
  automatic character from any picture is future work.
- **Assistant `codex` and custom command** for the brand interview are written to the generic stdin/stdout interface and tested only with a
  stand-in command. They get no tool limits from the hub. Try them with the real tools and fix the default `codex exec -` if needed.
- **Full-width Stage variant** of the Remotion kit for brands without a character and a generic scene toolkit: still to build. Reels for such
  brands rely on the reel skill composing full-width scenes from `src/kit` (colours, fonts, captions).
- **Delete brand** leaves the Instagram login in place when it cannot be moved cheaply (another volume): remove that profile folder by hand.
- **Brand creator polish**: editing a brand's colours, fonts and closing lines in the hub after creation (today: edit `brand.json`); a
  "first reel" shortcut that proposes ten starting questions right after creation (today: "Find new ideas" in the Factory).

## Later features (skills are installed, there is no pipeline yet)

- **Stories** (`ootto-story-sequencer`), **carousels** (`ootto-carousel-builder`, `ootto-viral-carousel`), **paid campaigns**
  (`ootto-paid-social-brief`, `ootto-utm-campaign-plan`): the factory only makes reels. Each needs its own page, job and scheduler flow. The skills are
  visible in Settings and off.

## Decisions pending

- **Backup** of the Docker volumes: the Instagram session (`chrome-profile`), job history (`hub-data`) and the 21 GB of VoiceStudio. No backup exists.
  Options: periodic `docker run ... tar` of `chrome-profile` and `hub-data` only (small), VoiceStudio can be downloaded again.
- **Open source release**: the code is prepared for it, nothing is pushed. Before pushing, decide:
  brand content is now git-ignored by one rule block (see README, "Your brands"), so the public tree holds none; the user rewrites the 3 local commits (soft reset);
  the licence (MIT is proposed, Ootto skills are MIT, VoiceStudio is AGPL-3.0 and is downloaded, not copied; Remotion has its own company licence: check it);
  the repository name and where it lives.

## Dates

- **A brand's offer ends on its `offer.lastDay`** (in `brand/<slug>/brand.json`; the user's brand: 2026-11-30). Done automatically: for a slot after that date the scheduler leaves the offer line out of the Instagram caption (`caption.md` is not changed, the job log says so). By hand after the last day: update the offer text in the brand's `style.md`, and check the first closing-A reel made afterwards has no offer line.

## Known limits

- `reel.make` keeps a broad shell (voice, Blender and render need it). It cannot read credential files or use curl, wget, ssh or `env`, but a script
  written from scratch could still read other files. Accepted for now.
- The hub reads only the project and local Claude settings inside the container, because the host's user hooks and plugins hang there (`claude-hub` wrapper).
- Docker disk use: about 28 GB of images after the cleanup of 2026-11-19 (38 GB of untagged old builds removed). Run `docker image prune` now and then.
- Tool output shown to the assistant can be shortened by a compression hook: check files with `grep` or `wc`, not only by reading the printed text.
