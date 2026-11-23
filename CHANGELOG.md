# Changelog

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
