# Changelog

## Unreleased

- **A carousel keeps its source, and says so when it does not.** The carousel job must leave in the folder what draws it (2D: `code/`; 3D: `scene.py`, `tex/`, `panorama.png`, `code/`) and the hub checks it. "Change one slide" looks for these files first: without them it stops before any run, says which are missing, and the carousel page shows the same message (a slide is one flat picture, so it cannot be fixed by hand). Carousels made before this have to be made again, or have the files put back.

## 1.0.3 (2026-11-25)

- **Change one slide of a carousel.** On the carousel's page, pick a slide and say what to change (`carousel.edit`): only that slide is drawn again (2D: its Remotion code; 3D: the scene is rendered again and only that strip is cut), the others are checked and put back if they changed, the new slide must be 1080 x 1350, the slide's alt text is updated if its picture changed, and the old slides, alt texts and caption are kept in `versions/` (newest ten).
- **Reels banner is true.** A reel is "Posted" once its Instagram slot has passed (Instagram publishes it), "Scheduled" before that, "Scheduling…" while a job runs. The Reels page reloads by itself (every 30 s, on focus, and when an Instagram job changes).
- **Character page:** the builder shows only for a brand that has no character yet.
- **No repeated ideas.** Ideas (Factory, Daily) are checked against the question list, every reel and carousel made (posted or not) and the hooks already posted; the prompts say so too.
- **Daily loop always uses hook-mining**, reel-insights and best-time-scheduler (with a small data set it says so plainly); all six skills are listed as used or not called.
- **Terminal:** permission level (ask, edit, plan, everything) chosen on the Terminal page, and every brand's data folder is within reach. Codex flags come from OpenAI's docs and are not tried.
- **Analytics: followers.** Followers gained per video and a daily history of the whole Instagram page (followers, reach, views, profile views), shown on the Analytics page and read by the daily readout. Threads and TikTok are not collected yet.
- **Daily loop and reels:** the reel is made after `reel-research`, `ootto-hook-mining` and `reel-hooks`; the daily run refreshes the best times (best-time-scheduler) before proposing slots.
- **Carousels can be scheduled from the app.** A carousel row has "To schedule" (the same slot picker as a reel) and a banner (Scheduled, then Posted once the slot has passed). The job uploads the slides as images in Instagram's own scheduler (Crop and Edit left as they are), types the caption, writes **an alt text for every slide** (searchable words about what the image shows, max 100 characters; the AI writes `alt.json` with each new carousel, and the four Easy Restaurant carousels have one) and reads it back. Tried on the real page on 25 Nov: scheduled for 20 Dec 03:10 with five slides and alt texts, verified on the calendar, then deleted (the test post is gone).
- **Reels are scheduled in the background.** The Instagram flow for a reel runs without a window (tried on the real page: scheduled, verified and deleted a far-off test post). If Instagram stops it before anything was scheduled, it runs once more with a minimized window (`SCHED_VISIBLE=1` forces the window). A carousel still needs the window: Instagram's Edit step for images fails with "Something went wrong" without a real GPU (headless, headless with software GL and a virtual display were all tried).
- **Series are episodes.** A series is a run of videos about one subject. "Plan a series" can write new episodes (up to 40) that go into the question list when you accept. Pick several episodes and send them to the Factory in one go, then schedule the finished ones one a day. Reels of a series are listed in Series (with posted/scheduled state) and no longer in Reels.

## 1.0.2 (2026-11-24)

- **Carousels, in 2D or 3D.** A new **Carousels** page: say what a carousel is about, choose 2D or 3D, the number of slides and the last slide (offer or follow), and the AI builds it: a plan, the slides (1080 x 1350), the caption. **2D** is Remotion only (real product screens in drawn tablet and phone frames, paper textures from real images, soft layered shadows, grain, a background that continues across the slides). **3D** is one wide Blender scene (Cycles on the GPU, depth of field, real materials) cut into slides with the text over it, so objects cross from one slide to the next. A carousel is built on the two Ootto skills `ootto-viral-carousel` (the structure) and `ootto-carousel-builder` (the words of every slide): both are on by default, the job calls them and fails if the AI did not. New `carousel` skill, a Blender kit with detailed props, a texture generator and a checker (four views, close-ups, numbers) in `scripts/carousel/`, and a read-only **product folder** per brand (Settings > Product) the slides take their real screens from. Not done: scheduling a carousel on Instagram from the Calendar.
- **Reels are made with the /brag method** (`reel` skill, "Make it land"): a brief first (what, for whom, the hook, the real thing to show, drawn: never screenshots of the brand's platform), a kind for every scene (hook, reveal, proof, highlight, closing), things that appear one by one, a reading time for every line, no muddy crossfades, and frames that are worth posting.

## 1.0.1 (2026-11-23)

- **One AI tool for everything: Claude or Codex** (Settings > AI tool). Reels, edits, ideas, the daily loop, readouts, the character and the brand assistant all run on the chosen tool. Codex runs `codex exec --json` in a sandbox, its events are translated into the ones the jobs know, the skills are linked where Codex looks for them (a job that needs a skill fails if Codex did not open its SKILL.md, like Claude), and the Terminal page runs Codex when it is the chosen tool. The interface marks Codex as not tested. Written from OpenAI's documentation and tested with a stand-in only.
- **The custom assistant command is gone.** The brand assistant is Claude or Codex. Codex now runs `codex exec --sandbox read-only --skip-git-repo-check --ephemeral -` (from OpenAI's non-interactive documentation), the command can be set with `HUB_CODEX_BIN`, and an old setting with a custom command falls back to Claude.
- **The character is designed in a conversation.** In the brand creator (form and interview, not the zip or folder import) an assistant that knows what was decided about the brand asks about the look and the personality and fills the fields of the prompt for the image tool, so the prompt is detailed. The three fields hold up to 1500 characters. The same chat is on the Character page of a brand that already exists; it reads the brand and what is already written. The brand interview now only asks whether you want a character.
- **Changing the character preview is a chat.** After the first preview you talk to Claude (it keeps the session, edits the builder and renders again) until you press **Approve and use this character**, which approves and makes the moves in one step. The builder and moves prompts ask for joined limbs, rounded shapes, real depth and a self-check.
- **Character from a picture, step 2:** after you approve a preview, **Make the moves** (`character.moves`) has Claude rig the character and Blender render idle, talk (with a closed and an open mouth), wave, point, thumbs up, jump and the expressions of the plan. The character then becomes the brand's (`brand.json`, voice, `code/mascot/Mascot.tsx`, style guide). Both steps were run for real; the result is rough but complete.
- The Character page read `Mascot.tsx` from the old workspace path; it now reads the brand's own `code/mascot/Mascot.tsx`.
- **Language of the reels** can be chosen per brand in Settings > Voice (it also updates the brand's style guide). The voice script and Whisper now use the brand's language, and Whisper word pieces are merged so non-English captions match the script.
- A brand that gets a character later (`character.enabled` edited in `brand.json`) has its voice moved from `identity/voice.*` to `mascot/<id>-voice.*` when the hub starts; nothing is overwritten.
- The hub has a linter (`npm run lint`, oxlint); errors fail CI. Unused code found by it was removed.
- README screenshots retaken (sidebar with icons and usage box, setup screen, reel page).

## 1.0.0 (2026-11-23)

The first release of Reel Studio as a desktop app. Before it, the project ran as a hub in a Docker container; that setup is gone.

### What it is

A one-line question in, a finished vertical reel out: Claude writes the script, VoiceStudio speaks it, Remotion draws the motion graphics (with an optional Blender character), Whisper times every word, and the app writes the caption and the cover and schedules the reel in Instagram's own scheduler. Several brands, each in its own folder.

### The app

- **Desktop app** for Arch Linux (Electron): a window, a tray icon (closing the window keeps the schedules and the daily loop running), system notifications, start at login, one copy at a time. A pacman package built from this repository (`packaging/arch`).
- **First-run setup screen:** checks the computer and installs what the app can: the video packages, Whisper, the Remotion skills, Blender, VoiceStudio (pick a voice mode; download, choose and remove voice models, each after you read its licence, with a progress bar). Everything it installs is in your studio folder (`~/ReelStudio/data/tools`).
- **Your files stay yours.** One folder per brand in `~/ReelStudio/data/brands/<brand>/`: identity, character, reels with their video, audio and code, the question list, the schedule, and the Instagram login. Updating, reinstalling or removing the app never touches them.

### Making reels

- **Factory:** pick questions, make reels in parallel (a queue keeps the GPU to one voice job at a time).
- **A page for each reel** with a player and a **chat with Claude** that changes it (same session across messages, the last three versions kept, undo, the reel is put back if a change fails).
- **Daily loop:** reads your results, proposes ideas, waits for your approval twice.
- **Brand creator:** form, interview with an AI, or import; closing lines, colours, fonts, logo, voice.
- **Instagram:** schedules through a real Chromium you log in to yourself (Settings > Instagram), verifies the post on Instagram's calendar. Reads run without a window.
- **Claude and Codex access:** the tool's own login (your subscription) or an API key (Settings), and the Claude session and week usage in the sidebar.

### Known limits

- Arch Linux only. The pacman package is built on your machine; the release also carries a prebuilt one.
- The first install downloads about 30 GB with the best voice on a GPU (less with the lighter voice modes).
- Tried end to end on one machine (COSMIC, an 8 GB NVIDIA GPU). Not tried with real credentials: Claude with an API key, Codex (untested, only an option for the brand interview), the Composio analytics of a second account.
- Voice models whose licences forbid commercial use (for example OmniVoice, CC-BY-NC) are listed with a warning, not recommended.
- Remotion is free for teams up to three people; larger companies need its company licence (see the README).
