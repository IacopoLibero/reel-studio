# Multi-brand Reel Hub

Decided on 2026-11-19, brought up to date on 2026-11-21 against the code (one folder per brand). Lines marked **Changed** record a decision that was revised while building.

> Brand names in this document (Acme Cafe, `acme`, the character Pip, the code ACMEFREE) are made-up examples. A real brand lives on the owner's machine, outside git.

The requirement: do not put the brand in the repository, but let the platform create a brand, so that one person can run several brands, each with its own hub.
You create the brand and the program makes all the folders it needs. If the brand has a character, you give a graphic reference made with an AI for images and the platform
provides the prompt. For a brand without a character you fill in the needed fields, or discuss it with Claude, Codex or another AI, and the brand is created.

## 1. What is public and what is private
The public repository holds the platform, a generic Remotion kit, our skills and `brand/_template`. It holds NO brand content: nothing of
Acme Cafe (style guide, question list, logo, voice sample, reel scripts and captions, branded compositions), nothing of Pip (the mascot model,
its Blender builder and renders). A real brand and its character keep working on the owner's machine, outside git, and are "just another brand" created by the same mechanism.
- Private (in your studio folder, outside this repository): `data/brands/<slug>/` for every brand (identity, character, reels and the hub's data: see section 2) and, in `workspace/src/`, the branded Remotion compositions (every folder of `src/` except `src/kit` and `src/cover`, and the characters' components). The common sounds (`sfx/`) are shipped by the program. The brand template stays in the repository (`brand/_template`) and is read from there. One rule block in `.gitignore` covers all of it; the README explains it ("Your brands are not in git").
- The public tree must typecheck, test, build and start with all of that absent. `src/Root.tsx` registers only generic compositions (`Cover`, shell);
  every reel is rendered from its own entry (`npx remotion render <brand folder>/reels/<n>-<name>/code/index.ts ...`), so branded code can simply be absent.
  Moving a branded folder must not break the user's working tree: do it by ignoring, not by moving, unless a move is cleaner and all imports are fixed.
- Git history: the repository starts from a clean history that holds no brand content.

## 2. Brand model
One folder per brand, `~/ReelStudio/data/brands/<slug>/` (called `<brand>` below). It also holds the hub's own data of the brand, so a brand is one folder to back up, move or delete:
```text
identity/   brand.json, style.md, logo.png (a PNG, only when the brand has one), and voice.wav / voice.txt / voice.json when the brand has no character
mascot/     only with a character: <id>.py (Blender script), <id>.blend, <id>-expressions.png, <id>-head.json, <id>-voice.wav / .txt / .json,
            movements/<move>/ (the rendered PNG sequences) and studio/ (the reference sheet, plan and previews of a character being built)
reels/      one folder per reel, <n>-<name>/: script, plan, MP4, caption, cover, audio/
```
The question list (`reel-questions.md`), the settings, the schedule, the daily plans, the analytics and the Instagram login (`profile/`) are in the same folder. With a character the voice is the character's (`mascot/<id>-voice.*`); without one it is the brand's own (`identity/voice.*`).
`identity/brand.json` (zod-validated, versioned):
```json
{ "version": 1, "slug": "acme", "name": "Acme Cafe", "language": "en", "readoutLanguage": "en", "website": "acme.org",
  "about": "...", "audience": "...", "tone": "...",
  "colors": { "background": "#f5f0e8", "text": "#1a1a1a", "accent": "#d94a3d", "secondary": "#854dff" },
  "fonts": { "headline": "Oswald", "body": "Inter" },
  "closing": { "A": { "label": "Try Acme Cafe", "line": "..." }, "B": { "label": "Follow for tips", "line": "Follow me for more restaurant tips." } },
  "offer": { "lastDay": "2026-11-30", "regex": "ACMEFREE" },
  "instagram": { "account": "acme_cafe", "userId": "..." },
  "sources": { "blogDir": null },
  "character": { "enabled": true, "id": "pip", "name": "Pip" },
  "voice": { "engine": "voxcpm2", "sample": "mascot/pip-voice.wav", "sampleText": "mascot/pip-voice.txt" } }
```
`voice.sample` is relative to the brand folder; the paths a style guide names are too. `style.md` is the human-readable guide the reel skill reads. `brand.json` is the machine source for colours,
fonts, closing, offer and Instagram (`language` is the language of the reels, `readoutLanguage` the one the hub writes to the person who runs the brand); `style.md` keeps the prose. The Cover and the Remotion kit read colours and fonts from `brand.json`
(no hard-coded Acme Cafe colours in generic code). `brand/_template/` (in the repository) has a `brand.json` skeleton, the style.md and question list placeholders; the voice guide is `.claude/skills/reel/voice-sample.md`.

## 3. "Each brand has its own hub"
Everything in the hub is scoped to the current brand: Jobs, Daily, Calendar, Factory, Analytics, Series, Reels, Instagram, Character, Settings.
- Brand switcher in the nav (name, small colour dot), current brand in the URL hash (`#/<brand>/<page>`) and remembered; a "New brand" entry.
- Data: `<data>/brands/<slug>/` (`~/ReelStudio/data/brands/<slug>/`) holds that brand's settings (slot pattern, daily loop, factory rules, Threads toggle), jobs (job records carry
  `brand`), daily plans, analytics snapshots and hooks.csv, ideas, series, scheduled.json, locks. Global settings (Blender device, Claude model,
  assistant command, ports) stay in `<data>/settings.json`. The Instagram browser profile is per brand: `<data>/brands/<slug>/profile/`;
  Settings > Instagram logs in and shows the state of the current brand's account; the scheduler, collector and calendar use that brand's profile, user id and
  account. Only one browser flow runs at a time across all brands (existing queue).
- API: every brand-scoped route is `/api/brands/:slug/...`; the old `/api/...` paths still answer for the first brand. The daily loop runs per brand (own switch, own earliest time); the connectivity gate and heavy-job gate are shared.
- Notifications name the brand ("Reel Hub, acme: 3 new reel ideas").
- Factory/ideas/make prompts take brand paths from the registry (no `BRAND` env assumption); `reel-questions.md`, `style.md`, closing rules and the
  offer rule come from the brand. The reel skill reads `<brand>/identity/style.md`; a brand without a character uses full-width drawings (see 5).

## 4. Where a render finds a brand's files (built)
Remotion reads the logo, the sounds, the character's frames and each reel's audio with `staticFile()` from one `public` folder. Because each brand keeps
them in its own folder, `remotion.config.ts` builds that folder for the brand of the run (`REEL_BRAND`, set by the hub for every job, else the first brand; the brand folders are found through `REEL_BRANDS_DIR`, which the hub sets to `<data>/brands`)
out of hard links, in `workspace/.reel-studio/public-<uid>/<brand>-<pid>/`, and removes it at the end (`scripts/brand-public.ts`):
`logo.png` from `identity/`, `mascot/<move>/` from `mascot/movements/`, `sfx/` from the program, `<n>-<name>/<voice>.wav` from each reel's `audio/`.
A brand with no logo has no `logo.png`, so another brand's logo is never drawn, and the cover leaves out the logo frame (`"logo": false` in `cover.json`).

A workspace made before this layout (brands with `brand.json` at the top of `workspace/brand/<slug>/`, and `reels/`, `mascot/`, `characters/`, `public/` next to `brand/`) is
moved with `scripts/migrate-brand-folders.sh`; brand folders already one-folder-per-brand inside the workspace (`workspace/brand/<slug>/identity`, `mascot`, `reels`) are moved into the data folder with `--into-data`, a rename that copies nothing. The migration (`src/layout/brand-folders.ts`): it copies and checks every file by content hash, rewrites the paths inside
`brand.json` and `style.md`, and only removes the old copies when asked (`--remove-old --yes`), and only those with an identical new copy.

## 5. Brand without a character, with a character (built)
- No character: the reel skill and the Remotion kit use a full-width layout (drawing across the screen, captions at the bottom, no mascot
  column). A new brand starts this way and works completely: the Factory, Reels, Calendar, Daily, Analytics, Series, Instagram and Jobs
  pages all render for a brand with zero reels, each with a first-step message. The generic Stage variant of the kit for full-width
  scenes is still to be built (see TODO.md); the reel skill builds full-width scenes from `src/kit` today.
- With a character: `brand.json` `character.enabled` with an `id` that names `<brand>/mascot/<id>.py` (Blender script, which writes its frames next to itself, in `movements/<move>/`)
  and the brand's own component. The creator can attach one that already exists on the machine ("Use one already on this machine").

## 6. Brand creator (built: page "New brand")
Three entries, one result. Every one of them posts a request to `POST /api/brands`, which validates it and queues ONE job, `brand.create`
(`src/creator/create-job.ts`).
1. **Form** (`web/creator/FormEntry.tsx`): all fields of section 2, hex pickers with a WCAG contrast note, font names checked against
   `@remotion/google-fonts` (`src/creator/fonts.ts`; when the package is missing the names are not checked, and the page says so),
   logo upload (a PNG up to 1 MB: covers and reel closings draw `logo.png`), slug made from the name and kept
   unique, closing A and B with a live preview of the last card and a word count (12 or fewer), optional offer, Instagram account,
   optional source folder (must be a full path), and the voice: reuse another brand's sample, upload a WAV (up to 25 MB) with its text, or
   decide later. Uploads go to `<data>/tmp-uploads/` first (content-checked, random ids, removed when the job ends or after a day).
2. **Discuss with an AI** (`InterviewEntry.tsx`, `src/creator/interview.ts`, `assistant.ts`): one turn per message, the whole conversation
   as input, the answer is one JSON object `{say, summary, done, brand?, styleMd?}` (zod-checked, one retry on a bad answer). The summary
   panel fills in as the chat goes; at the end `brand.json` and `style.md` are shown for review and editing, checked again by the hub,
   then Create. The assistant is a global setting: `claude` (HUB_CLAUDE_BIN, headless `-p`, allowed tools Read, Glob, Grep, WebFetch,
   WebSearch; denied: Bash, Write, Edit, the credential paths of `claude-safety.ts`, the project's `brand/` and `platform/data/`, and the `brands/` folder of the data folder; run in an empty scratch folder; the hub token is removed from its environment). `codex`
   (`codex exec -`) and a custom command read the prompt on stdin and print text; no shell is used, the line is split into words.
   **Only claude is tested.** The others are covered only by a stand-in command and get no tool limits from the hub.
3. **Import** (`ImportEntry.tsx`, `bundle.ts`, `zip.ts`): a zip or a picked folder with `brand.json` at the top, or in an `identity/` folder (one wrapping folder is
   stripped). Limits: 300 files, 25 MB per file, 40 MB in all, no symlinks, no encrypted or zip64 zips, no `..`, absolute or backslash
   paths. Only `brand.json`, `style.md`, `reel-questions.md`, `logo.png` and the voice sample (`identity/voice.*`, the character's `mascot/<id>-voice.*`, or an old `voice/` folder) are kept. A slug that exists is
   replaced by a free one and the person is told; machine-specific values (profile folder, source folder, a character that is not
   installed) are dropped with a note.

`brand.create` (idempotent, nothing overwritten, rolled back on failure): checks the request, refuses a slug that has a `brand.json` or
leftover folders, writes a marker (`data/brands/<slug>/.created-by.json` with the request id), calls `BrandRegistry.create`, then
writes `identity/style.md` (from the template, adapted: logo and voice paths, no Mascot section without a character, an "About the brand"
block; or the reviewed text from the interview or the imported one), an empty `reel-questions.md` in the data folder with the template's explanation and
both sections, the logo and the voice files (in `identity/`, or with the character in `mascot/`), a character taken from another brand (script, model, sheet and moves, cloned where the file system can), the character studio state and sheet, and, only if asked, turns the daily loop on and
calls `startDailyLoops(...).ensure(slug)`. The profile folder in `brand.json` is always the default one (a request cannot choose a
path). On failure every folder this run created is removed; the same request run again returns the first summary and changes nothing.
After it, the page lands on the brand's hub with a short "next steps" checklist.

Character step (optional: none / create / import): **create** starts with **Design the character with the assistant** (form and interview modes; not in the
zip or folder import): a chat (`POST /api/brand-creator/character-interview`, `src/creator/character-interview.ts`) where the assistant is given everything
decided about the brand so far (name, what it does, audience, tone, language, colours, fonts, and in the interview mode the style guide and the earlier
conversation) and asks only what is open about the character: what it is, body, face, the colour of each part, clothes, a signature detail, personality
and movement, its role, what to avoid. It fills the name and the three fields (up to 1500 characters each) after every answer, and you can edit them. The same chat is on the Character page of an existing brand (`POST /character/studio/chat`): the hub itself reads brand.json and style.md and the name and fields already written, so the assistant refines them instead of starting over. It then shows the prompt for an AI image tool (`src/shared/character-prompt.ts`: flat
2D vector, brand colours inserted, front, three-quarter and side views and eight expressions on a plain background, editable fields,
Copy button), takes the reference sheet (PNG or JPG up to 10 MB, stored in `<brand>/mascot/studio/`) and later runs `character.build`.
**import** copies a character that another brand on the machine has (its `mascot/<id>.py` and files, and its moves). The same studio is on the Character page of any brand.

`character.build` (experimental, `src/creator/character-job.ts`): headless Claude (writes only inside `<brand>/mascot/studio/`, runs Blender
only through `bash scripts/slot.sh blender 1 --`, no network, no credentials) reads the sheet, writes `plan.json` (parts, shapes,
colours, expressions, and a plain "limits" field) and `build.py` (Blender Python, flat colours, Workbench engine, flat lighting,
transparent background), runs it through the `blender-run` wrapper or the flatpak, and previews land in `<brand>/mascot/studio/previews/`.
The Character page shows them with the plan and an Approve button, and a notes box that reruns the job with all notes so far. The
public tree holds no builder of its own (the Pip builder is private): the job asks Claude to write one from the sheet, and may read a
`brand/*/mascot/*.py` of the machine as a method example only. Approval marks the state; **Make the moves** (`character.moves`, `src/creator/moves-job.ts`) then turns the approved preview into the moves reels use.

`character.moves` (experimental): after approval, headless Claude (writes only inside `<brand>/mascot/`, Blender only through `slot.sh`) rigs the
approved geometry and writes `mascot/<id>.py` to a fixed contract: a pivot per moving part, one `m_<name>(f)` per move, the literal dicts `MOVES`
(`name: (function, frames)`) and `LOOP_FROM`, a mouth with two states, and the commands `move <name>|all`, `still`, `blend`. It renders `idle` and `talk`
first and looks at them, then everything: idle, talk, wave, point, thumbs up, jump, and a holding face for each expression of the plan, as
`movements/<move>/f-NNNN.png` (mouth closed), `o-NNNN.png` (mouth open) and `info.json`. The hub then checks that `idle` and `talk` have all
their frames, sets `character` in `brand.json`, moves a voice sample from `identity/` to `mascot/<id>-voice.*`, writes
`<brand>/code/mascot/Mascot.tsx` (never over an existing one; frame counts and the `mouthOpen` helper) and adds the character to `style.md`.

## 7. Honest scope
Generating a good 3D-style rig from any image is hard (Pip took many iterations by hand). What exists: the multi-brand hub, the creator
(form, AI interview, import), the folder scaffolding, brands without a character fully working, the AI image prompt, the reference
upload, `character.build` (flat previews and a plan) and `character.moves` (the moves). Both were run for real on 23 Nov 2026 with Claude and
Blender on a reference sheet of a fork character: the result is recognisable and every move renders, but it is rough (blocky parts, thin
arms not joined to the body, no real side view). Expect to give notes and run the build again, or to finish the character by hand. Not verified here:
`codex` or a custom command as the interview assistant. A fully automatic, polished character from any picture is future work (TODO.md).
