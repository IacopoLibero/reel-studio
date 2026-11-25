# TODO

What is still open, on purpose. Move an item out of this file when it is done; what is done is in [CHANGELOG.md](CHANGELOG.md). Last update: 2026-11-23, after 1.0.1.

## Open

Nothing blocks the use of the app. These are the things that were not tried or not finished.

- **Small things.** A cover without a logo has its kicker not looked at.

- **Analytics: Threads and TikTok.** Instagram is built: followers gained per video (`follows`, shown as "Followers gained" and kept in `hooks.csv`) and a daily history of the whole page in `analytics/pages/instagram.csv` (followers, following, posts, reach, views, profile views, accounts engaged). Not tried with a real Instagram reading: the response shapes of `INSTAGRAM_GET_USER_INFO` / `INSTAGRAM_GET_USER_INSIGHTS` come from the tool schemas, and a metric Instagram refuses stays "n/a". Threads (`threads_followers`, `threads_views` come from the same insights tool) and TikTok are not collected yet; the page view already shows any `pages/<platform>.csv` for instagram, threads and tiktok.
- **Carousel in the background.** Instagram's Edit step for images needs a real GPU window, so a carousel is scheduled with a minimized window (a reel is scheduled in the background). To try: a window on a second GPU-backed display, or another way past the Edit step. Not checked: that the alt texts are still on a scheduled carousel when Instagram shows it again (they were written and read back before Schedule).

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

### Done
- **Character from a picture** (`character.build`, `character.moves`): both ran for real with Claude and Blender (23 Nov), from a sheet to the moves reels use. The result is rough: blocky parts, thin arms not joined to the body, no real side view. A full reel was made with a generated character (23 Nov): voice, Whisper captions, scenes with the character's moves, MP4 with audio, all worked. The builder prompts now ask for joined limbs, rounded shapes and depth (real run on 23 Nov: connected silhouette, traced head, face; still blocky edges), and changes are a chat. Next: smoother outlines, and a larger character in the reel layout. A fully automatic, polished character from any picture is future work.
- **Codex as the tool for everything** (`src/ai/agent.ts`, `codex-stream.ts`): written from OpenAI's documentation and tested only with a stand-in Codex. Try it with a real one: Settings > AI tool > Codex, then a reel. Unverified: the `--json` event shapes of `file_change` and `web_search`, `--add-dir` and `-c sandbox_workspace_write.network_access=true` on `exec`, `exec resume` with the sandbox flags, skills found through `.agents/skills`, web search in a read-only run, and that the voice server on localhost is reachable from the sandbox. A skill counts as called when Codex opens its SKILL.md with a command (the prompt tells it to), and a job that needs a skill fails otherwise, as with Claude: if a real Codex reads skills another way, those jobs will fail wrongly and the detection in `codex-stream.ts` needs to change. The Terminal page runs Codex (not tried); the sidebar usage box is Claude only.

- **Carousels** (`carousel.make`, 2D and 3D, on `ootto-viral-carousel` and `ootto-carousel-builder`): built and run for real with Claude on 23 Nov (a 2D carousel of Easy Restaurant with the product's real screens: five slides, caption and plan, both Ootto skills called). Not done: the carousel's **analytics** (impressions, saves and shares per carousel), and a **conversation** for a slide like the reel page (today one request at a time: `carousel.edit` changes one slide; the AI tool does not keep a session between requests). Codex was not tried with it.

### Open

The skills are installed and visible in Settings, but the factory only makes reels and carousels. Each of these needs its own page, job and scheduler flow:

- **Stories** (`ootto-story-sequencer`)
- **Paid campaigns** (`ootto-paid-social-brief`, `ootto-utm-campaign-plan`)

## Known limits

- Arch Linux only (pacman, a Chromium and an Electron from the system). The first install downloads about 30 GB with the best voice on a GPU.
- `reel.make` and `reel.edit` keep a broad shell (voice, Blender and render need it). They cannot read credential files (including the saved API keys and the hub token) or use curl, wget, ssh or `env`, but a script written from scratch could still read other files you can read. Accepted for now.
- Remotion agent skills are fetched from upstream at first run or when you press the step again; if upstream is unreachable the step fails and says so (`scripts/install-remotion-skills.sh` in the workspace does the same by hand).
- The offer rule only changes the Instagram copy of a caption (`caption.md` stays as it is). After a brand's last offer day, update the offer text in its `style.md` by hand and check the next closing-A reel.
- Instagram scheduling: about 30 days ahead, at least 20 minutes of lead time, 9:16 only, one browser job at a time across all brands.
- A reel already scheduled or posted can be changed in the chat, but Instagram keeps its own copy.
- Reels for a brand without a character are composed fresh by the `reel` skill from the kit's theme and captions (`src/kit`). There is no fixed library of scenes, on purpose: a fixed set would make every reel look the same.
- Names in a brand's moved code (`r7`, `a1`...) come from the order the reels were made in and stay as they are: they work, and the first reels of a brand render from its shared `code/` folder.
