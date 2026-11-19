# Multi-brand Reel Hub (decided with the user, 2026-11-19)

> Brand names in this document (Acme Cafe, `acme`, the character Pip, the code ACMEFREE) are made-up examples. The real brands live on the user's machine, outside git.

User's words, translated: "Do not put the brand in the repository. But there must be a way to create a brand inside the platform, so that I can have
several brands, each with its own hub. You create the brand and the program makes all the folders it needs. If the brand has a character you give a
graphic reference made with an AI for images, and the platform provides the prompt. For a brand without a character you fill in the needed fields, or
you discuss it with Claude / Codex / an AI and the brand is created."

## 1. What is public and what is private
The public repository holds the platform, a generic Remotion kit, our skills and `brand/_template`. It holds NO brand content: nothing of
Acme Cafe (style guide, question list, logo, voice sample, reel scripts and captions, branded compositions), nothing of Pip (the mascot model,
its Blender builder and renders). The user's own brand and Pip keep working on their machine, outside git, and later become "just another brand"
created by the same mechanism.
- Private (git-ignored by rule, never listed by name in the public repo): `brand/<slug>/` for every slug except `_template`, `reels/`, `public/mascot`,
  `public/<reel>` and `public/r*`, branded Remotion compositions (`src/a1 b1 c1 d1 e1 f1 f3 pip r*` and the characters' components), `mascot/` and
  `characters/<slug>/`. Use ONE clear rule block in `.gitignore` and document it in the README ("your brands live here and stay on your machine").
- The public tree must typecheck, test, build and start with all of that absent. `src/Root.tsx` registers only generic compositions (`Cover`, shell);
  every reel is rendered from its own entry (`npx remotion render src/r<n>/index.ts ...`) as today, so branded code can simply be absent.
  Moving a branded folder must not break the user's working tree: do it by ignoring, not by moving, unless a move is cleaner and all imports are fixed.
- Git history: the user will rewrite the 3 local commits (soft reset) after this work. Do not commit.

## 2. Brand model
`brand/<slug>/brand.json` (zod-validated, versioned):
```json
{ "version": 1, "slug": "acme", "name": "Acme Cafe", "language": "en", "website": "acme.org",
  "about": "...", "audience": "...", "tone": "...",
  "colors": { "background": "#f5f0e8", "text": "#1a1a1a", "accent": "#d94a3d", "secondary": "#854dff" },
  "fonts": { "headline": "Oswald", "body": "Inter" },
  "closing": { "A": { "label": "Try Acme Cafe", "line": "..." }, "B": { "label": "Follow for tips", "line": "Follow me for more restaurant tips." } },
  "offer": { "lastDay": "2026-11-30", "regex": "ACMEFREE" },
  "instagram": { "account": "acme_cafe", "userId": "..." },
  "sources": { "blogDir": null },
  "character": { "enabled": true, "id": "pip", "name": "Pip" },
  "voice": { "engine": "voxcpm2", "sample": "voice/pip-voice.wav", "sampleText": "voice/pip-voice.txt" } }
```
plus `style.md` (human-readable guide the reel skill reads), `reel-questions.md`, `logo.png`, `voice/`. `brand.json` is the machine source for colours,
fonts, closing, offer and Instagram; `style.md` keeps the prose. The Cover and the Remotion kit read colours and fonts from `brand.json`
(no hard-coded Acme Cafe colours in generic code). `brand/_template/` gets a `brand.json` skeleton and keeps its style.md placeholders.

## 3. "Each brand has its own hub"
Everything in the hub is scoped to the current brand: Jobs, Daily, Calendar, Factory, Analytics, Series, Reels, Instagram, Character, Settings.
- Brand switcher in the nav (name, small colour dot), current brand in the URL hash (`#/<brand>/<page>`) and remembered; a "New brand" entry.
- Data: `platform/data/brands/<slug>/` holds that brand's settings (slot pattern, daily loop, factory rules, Threads toggle), jobs (job records carry
  `brand`), daily plans, analytics snapshots and hooks.csv, ideas, series, scheduled.json, locks. Global settings (Blender device, Claude model,
  assistant command, ports) stay in `platform/data/settings.json`. The Instagram browser profile is per brand: `/data/chrome-profile/<slug>/`;
  the Instagram page logs in and shows the account of the current brand; the scheduler, collector and calendar use that brand's profile, user id and
  account. Only one browser flow runs at a time across all brands (existing queue).
- API: every brand-scoped route takes the brand (`/api/brands/:slug/...` is cleanest; keep the old paths working for the default brand during the
  migration if the live UI needs it). The daily loop runs per brand (own switch, own earliest time); the connectivity gate and heavy-job gate are shared.
- Notifications name the brand ("Reel Hub, acme: 3 new reel ideas").
- Factory/ideas/make prompts take brand paths from the registry (no `BRAND` env assumption); `reel-questions.md`, `style.md`, closing rules and the
  offer rule come from the brand. The reel skill reads `brand/<slug>/style.md`; a brand without a character uses full-width drawings (see 5).

## 4. Migration of the existing data (the LIVE system must not break)
The live hub (container `reel-hub`, daily loop ON) currently has global data: `platform/data/{settings.json,jobs.json,scheduled.json,daily/,analytics/,ideas/,series.json,...}`
and the Instagram profile in the volume at `/data/chrome-profile`. At first start with the new code: take a full copy to
`platform/data/backup-pre-brands-<timestamp>/` (not the Chrome profile: it is large; copy only its path in a note), create
`brand/acme/brand.json` from what is known (values in the repo today and `.env`: BRAND, IG_USER_ID, IG_ACCOUNT, OFFER_*, BLOG_DIR), then move or
link the data into `data/brands/acme/`, and keep the Chrome profile in place by treating the legacy `/data/chrome-profile` as that brand's profile
(a `profile` path field or a symlink), so the Instagram login survives. Idempotent, logged, reversible (the backup). Restart the hub only when `GET /api/jobs`
shows no running or queued job (token from platform/.env, never printed).

## 5. Brand without a character, with a character (built)
- No character: the reel skill and the Remotion kit use a full-width layout (drawing across the screen, captions at the bottom, no mascot
  column). A new brand starts this way and works completely: the Factory, Reels, Calendar, Daily, Analytics, Series, Instagram and Jobs
  pages all render for a brand with zero reels, each with a first-step message. The generic Stage variant of the kit for full-width
  scenes is still to be built (see TODO.md); the reel skill builds full-width scenes from `src/kit` today.
- With a character: `brand.json` `character.enabled` with an `id` that names `mascot/<id>.py` (Blender script), `public/mascot/<move>/`
  and the brand's own component. The creator can attach one that already exists on the machine ("Use one already on this machine").

## 6. Brand creator (built: page "New brand")
Three entries, one result. Every one of them posts a request to `POST /api/brands`, which validates it and queues ONE job, `brand.create`
(`src/creator/create-job.ts`).
1. **Form** (`web/creator/FormEntry.tsx`): all fields of section 2, hex pickers with a WCAG contrast note, font names checked against
   `@remotion/google-fonts` (`src/creator/fonts.ts`; when the package is missing the names are not checked, and the page says so),
   logo upload (PNG or plain SVG up to 1 MB, SVG with scripts, event handlers or links refused), slug made from the name and kept
   unique, closing A and B with a live preview of the last card and a word count (12 or fewer), optional offer, Instagram account,
   optional source folder (must be a full path), and the voice: reuse another brand's sample, upload a WAV (up to 25 MB) with its text, or
   decide later. Uploads go to `<data>/tmp-uploads/` first (content-checked, random ids, removed when the job ends or after a day).
2. **Discuss with an AI** (`InterviewEntry.tsx`, `src/creator/interview.ts`, `assistant.ts`): one turn per message, the whole conversation
   as input, the answer is one JSON object `{say, summary, done, brand?, styleMd?}` (zod-checked, one retry on a bad answer). The summary
   panel fills in as the chat goes; at the end `brand.json` and `style.md` are shown for review and editing, checked again by the hub,
   then Create. The assistant is a global setting: `claude` (HUB_CLAUDE_BIN, headless `-p`, allowed tools Read, Glob, Grep, WebFetch,
   WebSearch; denied: Bash, Write, Edit, the credential paths of `claude-safety.ts` and the project's `brand/`, `reels/`,
   `characters/` and `platform/data/`; run in an empty scratch folder; the hub token is removed from its environment). `codex`
   (`codex exec -`) and a custom command read the prompt on stdin and print text; no shell is used, the line is split into words.
   **Only claude is tested.** The others are covered only by a stand-in command and get no tool limits from the hub.
3. **Import** (`ImportEntry.tsx`, `bundle.ts`, `zip.ts`): a zip or a picked folder with `brand.json` at the top (one wrapping folder is
   stripped). Limits: 300 files, 25 MB per file, 40 MB in all, no symlinks, no encrypted or zip64 zips, no `..`, absolute or backslash
   paths. Only `brand.json`, `style.md`, `reel-questions.md`, `logo.png|svg` and `voice/*.wav|txt` are kept. A slug that exists is
   replaced by a free one and the person is told; machine-specific values (profile folder, source folder, a character that is not
   installed) are dropped with a note.

`brand.create` (idempotent, nothing overwritten, rolled back on failure): checks the request, refuses a slug that has a `brand.json` or
leftover folders, writes a marker (`data/brands/<slug>/.created-by.json` with the request id), calls `BrandRegistry.create`, then
writes `style.md` (from the template, adapted: logo and voice paths, no Mascot section without a character, an "About the brand"
block; or the reviewed text from the interview or the imported one), an empty `reel-questions.md` with the template's explanation and
both sections, the logo and the voice files, the character studio state and sheet, and, only if asked, turns the daily loop on and
calls `startDailyLoops(...).ensure(slug)`. The profile folder in `brand.json` is always the default one (a request cannot choose a
path). On failure every folder this run created is removed; the same request run again returns the first summary and changes nothing.
After it, the page lands on the brand's hub with a short "next steps" checklist.

Character step (optional: none / create / import): **create** shows the prompt for an AI image tool (`src/shared/character-prompt.ts`: flat
2D vector, brand colours inserted, front, three-quarter and side views and eight expressions on a plain background, editable fields,
Copy button), takes the reference sheet (PNG or JPG up to 10 MB, stored in `characters/<slug>/`) and later runs `character.build`.
**import** attaches a `mascot/<id>.py` that exists on the machine. The same studio is on the Character page of any brand.

`character.build` (experimental, `src/creator/character-job.ts`): headless Claude (writes only inside `characters/<slug>/`, runs Blender
only through `bash scripts/slot.sh blender 1 --`, no network, no credentials) reads the sheet, writes `plan.json` (parts, shapes,
colours, expressions, and a plain "limits" field) and `build.py` (Blender Python, flat colours, Workbench engine, flat lighting,
transparent background), runs it through the `blender-run` wrapper or the flatpak, and previews land in `characters/<slug>/previews/`.
The Character page shows them with the plan and an Approve button, and a notes box that reruns the job with all notes so far. The
public tree holds no builder of its own (the Pip builder is private): the job asks Claude to write one from the sheet, and may read a
`mascot/*.py` of the machine as a method example only. Approval only marks the state; it does not turn the preview into moves.

## 7. Honest scope
Generating a good 3D-style rig from any image is hard (Pip took many iterations by hand). What exists: the multi-brand hub, the creator
(form, AI interview, import), the folder scaffolding, brands without a character fully working, the AI image prompt, the reference
upload, and `character.build` as an experiment that gives flat previews and a plan, not a finished character. Not verified here:
`character.build` with a real Claude and a real Blender (only a stand-in Claude was run), and `codex` or a custom command as the
interview assistant. A fully automatic character from any picture, with moves, is future work (TODO.md).

## 8. Ownership and order
1. FOUNDATION agent: sections 1, 2, 3, 4 (brand registry and `brand.json`, per-brand data and settings, per-brand Instagram profile and daily loop, API scoping,
   brand switcher, migration, public tree free of brand content, generic kit reading `brand.json`).
2. CREATOR agent (after the foundation is done): sections 5, 6 (page New brand, form, AI interview, import, `brand.create`, character step, prompt, upload,
   `character.build`, delete brand to the trash), docs, tests. Done; see sections 5 to 7 for what was really built.
Both: tests first, 80%+ on new modules, files under 400 lines, English UI text and comments, no secrets printed, never touch Instagram write actions in
tests, never stop the live container, never `docker compose down`, restart the hub only when no job is running or queued.
