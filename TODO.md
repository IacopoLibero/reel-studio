# TODO

What is still open, on purpose. Move an item out of this file when it is done; what is done is in [CHANGELOG.md](CHANGELOG.md). Last update: 2026-11-23, after the release of 1.0.0.

## Open after 1.0.0

Nothing blocks the use of the app. These are the things that were not tried or not finished, most useful first.

- **Screenshots in the README are from 20 and 21 November.** Since then the sidebar has icons, the Claude usage box and Setup and Sign out right under Settings; Settings has the sections Claude and Codex, Instagram and Voice; the Reels page opens a page for each reel. Retake `reels-list.png`, `settings.png`, `hero-overview.jpg` (sidebar) and add the setup screen and the page of a reel (with the chat). Use a scratch hub with the invented Acme Bakery brand (see CONTRIBUTING.md), never your own brands.
- **The package, on another machine.** It was built and installed only on this computer. Not done: `namcap`; a clean Arch system or user to check the dependency list (`nodejs`, `npm`, `git`, `ffmpeg`, `chromium`, `uv`, `electron`, `gcc`, `make`); the first-run text on a machine that lacks some of them (the setup shows the `pacman` line for each, not tried); the Electron window and the tray on a fresh studio folder (the clean-install test started the hub directly). The release package is built from a clean clone but on this machine.
- **The time of a real first install is not measured.** The clean-install test ran on a very slow line, so the two big model downloads (Whisper, the voice weights) were seeded from files already on the machine (see the notes of 23 Nov in the history). On a normal line it is mostly the 30 GB of the best voice.
- **The reel page was looked at by you, not clicked through by me.** The chat that changes a reel, the undo and the versions were tried through the API and with a real Claude (a headline made 15% bigger, a follow-up question in the same conversation), and the page as a screenshot; the undo button and its confirmation are covered by tests only.
- **Claude with an API key and Codex were tried only with stand-ins.** The login mode of Claude was tried for real (the sidebar read the session and week usage). The API-key mode, the key file and the Test button need a real key; Codex is not installed here, so its Test says so. No Codex usage display (it reports no limits). The sidebar usage is as fresh as the last Claude run: the Check button makes one small call to read it again.
- **Instagram.** A schedule from the calendar works (you made one on 22 Nov, it was verified), and the login is kept in the brand's folder. Not tried: logging in from scratch on a new brand through the Settings button, and the schedule flow when Instagram changes its page (the flow handles the two notices it knows; an unknown dialog stops it with a screenshot).
- **Voice.** OmniVoice (CC-BY-NC) is not installed on purpose (non-commercial). Languages other than English, and choosing another voice for one brand, were not tried. A character added to a brand later (there is no screen for it) should move the brand's own voice from `identity/` to `mascot/<id>-voice.*`.
- **Small things.** The Forky head shape (`mascot/<id>-head.json`) was rebuilt from rendered frames after a file was lost: if the original character sheet turns up, trace the head again. A cover without a logo has its kicker not looked at. The hub has no linter, only `tsc` and the tests (the Remotion kit has `eslint src && tsc`).

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
- **Ideas panel** (Factory > Find new ideas): Accept and Reject were tried through the API on a real batch (23 Nov) and on temporary copies, not clicked on a real list.
- **Daily loop, repeated runs.** Check on real runs that `reel.make` calls `reel-hooks` (the job log shows `SKILL CALLED`) and review the improvement proposals in
  `~/ReelStudio/data/brands/<slug>/daily/<date>.json` (none is ever applied by the hub).

## After the app (big, born with the final structure)

- **Character from a picture** (`character.build`): built as an experiment (plan, Blender script, flat previews with approval and notes) and only run with a
  stand-in Claude so far. Not done: running it for real with Claude and Blender on a real sheet, and turning an approved preview into the moves reels use
  (talk, wave, expressions, `mascot/movements/<move>/` frames, the Remotion component). A fully automatic character from any picture is future work.
- **Assistants `codex` and custom command** for the brand interview follow the generic stdin and stdout interface and were tested only with a stand-in command.
  They get no tool limits from the hub. Try them with the real tools and fix the default `codex exec -` if needed.
- **Full-width `Stage` variant of the Remotion kit** and a generic scene toolkit: `src/kit` has only the theme and captions. Reels for a brand without a character rely on the
  `reel` skill composing full-width scenes from them.
- **Stories** (`ootto-story-sequencer`), **carousels** (`ootto-carousel-builder`, `ootto-viral-carousel`) and **paid campaigns** (`ootto-paid-social-brief`,
  `ootto-utm-campaign-plan`): the skills are installed but the factory only makes reels. Each needs its own page, job and scheduler flow. They are visible in Settings and off.

## Known limits

- Arch Linux only (pacman, a Chromium and an Electron from the system). The first install downloads about 30 GB with the best voice on a GPU.
- `reel.make` and `reel.edit` keep a broad shell (voice, Blender and render need it). They cannot read credential files (including the saved API keys and the hub token) or use curl, wget, ssh or `env`, but a script written from scratch could still read other files you can read. Accepted for now.
- Remotion agent skills are fetched from upstream at first run or when you press the step again; if upstream is unreachable the step fails and says so (`scripts/install-remotion-skills.sh` in the workspace does the same by hand).
- The offer rule only changes the Instagram copy of a caption (`caption.md` stays as it is). After a brand's last offer day, update the offer text in its `style.md` by hand and check the next closing-A reel.
- Instagram scheduling: about 30 days ahead, at least 20 minutes of lead time, 9:16 only, one browser job at a time across all brands.
- A reel already scheduled or posted can be changed in the chat, but Instagram keeps its own copy.
- Names in a brand's moved code (`r7`, `a1`...) come from the order the reels were made in and stay as they are: they work, and the first reels of a brand render from its shared `code/` folder.
