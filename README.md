# Reel Studio

A reel factory you run on your own computer. You give it one line ("why do guests hate QR menus?") and it makes a finished
vertical video (1080 x 1920) with a cloned voice, word-timed captions, an optional character built in Blender, motion graphics
written in code with Remotion, a caption and a cover, and then schedules it on Instagram. A web app, the Reel Hub, runs the whole thing
in one Docker container: a job list with progress bars, a Claude Code terminal, a content calendar, an idea factory, a daily
loop that proposes new reels for your approval, and analytics.

Everything runs locally. Your Claude login, Instagram session and tokens never leave your machine.
The repository holds the platform, a generic Remotion kit and the skills, and **no brand**: your brands live on your machine
(see "Your brands" below) and the hub gives each one its own pages, data, settings and Instagram account.

## Features

- One command install (`./install.sh`): Docker image with Blender, Node, Remotion, Claude Code, Chromium; VoiceStudio and its
  VoxCPM2 voice engine downloaded from their official sources at first start.
- `/reel` skill for Claude Code: script, voice, timing, scenes, render, checks, caption, cover.
- Factory: pick questions from `brand/<brand>/reel-questions.md`, make several reels in parallel, with a queue for the GPU.
- Instagram scheduling through a real browser (Playwright, noVNC for your own login), with verification on the calendar.
- Daily loop (optional): analyses your results, proposes 3 ideas, waits for your approval, makes the reels, waits for your review.
- Analytics through Composio (optional), hook mining, series planning, best-time suggestions (Ootto content skills).
- Several brands, each with its own hub pages, data, settings, daily loop and Instagram login. A brand is a folder with a
  `brand.json` (colours, fonts, closing lines, offer, Instagram, character, voice), a style guide and a question list.

## Requirements

- Linux with Docker Engine and Docker Compose v2 (`docker compose`). Windows: WSL2 works in principle; macOS is not tested.
- About 45 GB of free disk with a GPU, about 15 GB in CPU mode (image 8 GB, VoiceStudio and its models).
- **A NVIDIA GPU of about 8 GB with the NVIDIA Container Toolkit is recommended.** The voice engine (VoxCPM2) is much faster
  on it. Without a GPU the installer offers CPU mode: everything works, but making the voice of a 40 second reel can take
  many minutes. The hub, Blender (CPU rendering) and Remotion do not need a GPU.
- A Claude subscription (Claude Code) for the AI parts. Instagram Business or Creator account for scheduling.
- Optional: a Composio account (free plan exists) for the analytics page.

## Quick start

    git clone <this repository> reel-studio && cd reel-studio
    claude          # once, on the host: log in to Claude Code, then quit (the container shares this login)
    ./install.sh    # checks, builds, starts, installs the voice engine, runs a smoke test (30 to 90 minutes the first time)
    # open http://127.0.0.1:4000 and paste the token the installer printed
    # then: Instagram page > login (type your own password), and ./scripts/new-brand.sh my-brand

`./install.sh --yes` asks nothing. `./install.sh --help` lists the options (CPU mode, other ports, a second instance).
`./update.sh` pulls and rebuilds, `./uninstall.sh` removes the stack and asks before deleting the volumes (`--yes` keeps them, `--yes --delete-volumes` deletes them).

## How it fits together

    host                                   container "reel-hub" (Ubuntu 24.04, runs as your user)
    ----                                   -------------------------------------------------
    browser --> 127.0.0.1:4000 -----------> hub (Node 22, Fastify, React)  --- jobs --> claude -p (headless, your login)
                                              |  terminal (node-pty + tmux)            Blender (headless, mascot)
                                              |  Instagram scheduler ---> Chromium on Xvfb <--- noVNC (your login)
                                              |  daily loop, factory, calendar          Remotion (render), ffmpeg
                                              v                                         whisper.cpp (word timing)
    127.0.0.1:3900 <---------------------- VoiceStudio API (uvicorn) + VoxCPM2 engine (GPU or CPU)
    project folder  <== bind mount, same path inside and outside (reels, brands, skills, scripts)
    ~/.claude, ~/.claude.json  <== bind mount (your Claude login)
    ~/.composio (optional, read-only)
    Docker volumes: hub-data, chrome-profile (Instagram session), voicestudio-config, omnivoice-data, hf-cache, uv-python,
                    uv-cache, whisper-cpp, hub-node-modules

## The pages of the hub

Jobs (live progress, logs, cancel), Claude (terminal in the page), Factory (questions, make reels, find new ideas), Daily
(the daily loop: readout, ideas, review), Reels (every reel folder and its Instagram status), Calendar (scheduled posts, best
times), Instagram (session status, login window, queue), Analytics, Series, Character (the moves of a brand's character and adding details with Claude and Blender; for a brand without one, the experimental
character-from-a-picture steps), Settings (Blender device, Claude model, slot pattern, daily loop, which content skills are on, the brand assistant, delete brand).
Every page is for the brand chosen in the switcher at the top of the menu; the address is `#/<brand>/<page>`.
Operations and details: `platform/README.md`, `platform/docs/DESIGN.md`, `platform/docs/DAILY.md`.

## Configuration

All of it is in `.env` (created by `install.sh`, documented line by line in `.env.example`): ports, container and project names
(so a second copy can run beside the first), `HUB_TOKEN`, host user and paths, `GPU`, `VOICE_DEVICE`, `BLENDER_DEVICE`.
Everything about a brand (Instagram account and user id, source texts folder, offer rule) is in its `brand.json`, not in `.env`.
Only an installation that was made before brands existed still has `BRAND`, `IG_USER_ID`, `IG_ACCOUNT`, `BLOG_DIR`, `OFFER_LAST_DAY`
and `OFFER_REGEX` in `.env`: the first start of the hub copies them into that brand's `brand.json` once, after a backup.

## Brands

**Your brands live on your machine and stay out of git.** A single block in `.gitignore` covers everything that belongs to a
brand: `brand/<slug>/` (except `brand/_template`), `reels/`, `characters/`, `mascot/`, the branded Remotion compositions in
`src/<reel>/` (every folder of `src/` except `src/kit` and `src/cover`) and the frames and sounds in `public/`. The public
project builds, tests and starts with all of that absent. Back your brands up yourself (a private repository, a drive):
nothing else holds them.

### Create a brand

In the hub open the menu at the top and choose **New brand**. There are three ways in, and all of them end in the same single job
(`brand.create`), which validates everything, makes every folder and file, and registers the brand without a restart:

1. **Fill in a form.** Name, slug (made from the name, kept unique), language, website, what it sells, audience, tone; four
   colours with pickers and a contrast check (against the text colour and the background); two font names checked against the
   Google fonts Remotion can load; a logo (PNG or SVG, up to 1 MB); the two closing lines A and B with a live preview of the last
   card; an optional offer (last day and code word), Instagram account name and folder of source texts; and the voice: reuse
   another brand's sample, upload a WAV with its text, or decide later.
2. **Discuss it with an AI.** A chat in which an assistant asks one question at a time, in your language, with a running summary
   beside it. At the end you see the generated `brand.json` and `style.md`, edit them, and press Create. The assistant is a global
   setting (Settings > Brand assistant): `claude` (the default; one headless `claude -p` call per message, with the whole
   conversation as input, read-only tools, no access to credentials or to your other brands), `codex`, or any command that reads
   the prompt on stdin and prints text. **Only `claude` has been tested.** `codex` and a custom command are written to the same
   interface and tested only with a stand-in command; they get no tool limits from the hub.
3. **Import a folder or a zip** with a `brand.json` at the top (to move a brand between machines). Only `brand.json`, `style.md`,
   `reel-questions.md`, the logo and the voice files are taken; paths that climb out of the folder, links, oversized files and
   zip bombs are refused; a slug that already exists is never overwritten (the import gets a new slug).

After creating, you land on the new brand's hub with a short checklist: log in to Instagram on its Instagram page, add the first
questions (or press "Find new ideas" in the Factory), make the first reel. A brand starts with an empty question list, the daily
loop off (unless you switch it on in the form) and no character. Every page has a first-step message while it is empty.

What a new brand gets: `brand/<slug>/` (`brand.json`, `style.md`, `reel-questions.md`, logo, `voice/`), `reels/<slug>/`,
`platform/data/brands/<slug>/` and the Instagram profile folder. A failed creation removes what it made; the same request run again
changes nothing. From a terminal, `./scripts/new-brand.sh my-brand --name "My Brand" --website mybrand.com` makes the same folders
with neutral values.

`brand.json` is the machine source for colours, fonts, closing lines, offer and Instagram; `style.md` keeps the prose guide that the
`reel` skill reads. The Remotion kit (`src/kit`) and the cover read the colours and fonts from `brand.json`; a render picks the
brand from `REEL_BRAND=<slug>` (the hub sets it for you), else the first brand. A brand with no character uses full-width scenes
and works completely.

### Delete a brand

Settings > Delete this brand (type the slug to confirm). Nothing is erased: the brand folder, its reels, its data and its character
folder move to `platform/data/trash/<slug>-<time>/`. The last brand cannot be deleted, and a brand with a queued or running job is
refused. The brand's Instagram login moves too when it can be done cheaply; otherwise it stays and the answer says where.

### A character (optional)

A brand may have a character: set `character` in `brand.json` and keep its Blender script at `mascot/<id>.py`, its rendered
move frames in `public/mascot/<move>/` (`f-NNNN.png` mouth closed, `o-NNNN.png` open) and its React component in the brand's own reel
code. The hub's Character page lists the moves and can add one with Claude and Blender; "Use one already on this machine" in the
creator attaches an existing `mascot/<id>.py`.

To start from a picture, the Character page (and the character step of the creator) gives you a ready prompt for an AI image tool
(flat 2D vector, the brand colours inserted, a sheet with front, three-quarter and side views and eight expressions on a plain
background) with a Copy button. You make the sheet elsewhere and upload it (PNG or JPG, up to 10 MB); it is stored in
`characters/<slug>/`. **Build previews** then runs the experimental `character.build` job: headless Claude reads the sheet, writes a
structured plan (`plan.json`) and a Blender script (`build.py`), and Blender renders first flat-shaded previews, which you
approve or send back with notes. **This needs iteration and may not give a finished character**; turning an approved preview into
the moves the reels use is still manual work (see `TODO.md`).

## Security model

- The hub listens on 127.0.0.1 only and needs the token. Do not expose it to a network without your own authentication and TLS.
- Credentials never leave the machine: the Claude login and the Composio login are mounted from your home folder (the Composio
  one read-only), the Instagram session lives in a Docker volume, you type the Instagram password yourself in the noVNC window.
- Claude jobs read untrusted web text, so `platform/hub/src/jobs/claude-safety.ts` denies them any read of `.env`,
  `~/.claude`, `~/.composio`, `~/.config`, `/data` and the Instagram profile, and restricts research jobs to a few shell
  commands. The reel-making job needs a broad shell (voice, Blender, render): it cannot read those files or use `curl`, `wget`,
  `ssh`, `env`, but a prompt-injected model could still read other project files. Treat the project folder as the trust boundary.
- The container sees only the project folder, your Claude and Composio files, and the optional `BLOG_DIR`.
- Full policy and how to report a problem: `SECURITY.md`.

## Costs

- Claude: the jobs use your Claude plan's usage (a reel is one long headless session; the daily loop adds a few more each day).
  Heavy use can hit your plan limits.
- Composio: the analytics page calls Composio's Instagram tools; the free plan has a monthly quota. Check your Composio account.
- Everything else is free software running on your hardware. Remotion is free for individuals and small teams; larger companies
  need a license (see `THIRD_PARTY_NOTICES.md`). Instagram scheduling uses the browser you log in to, not a paid API.

## Troubleshooting

- **Claude hangs inside the container.** Your host Claude settings (hooks, plugins, MCP servers that call host-only programs)
  can hang headless Claude. The hub runs `claude` through `platform/docker/claude-hub`, which reads only project and local settings
  and keeps your login. If you start Claude by hand in the container, use `claude-hub`.
- **Instagram "Reels" notice or month picker blocks the scheduler.** Instagram shows a one-time notice about reels and a month
  picker for the date; the scheduler handles both (`platform/docs/DESIGN.md`, the scheduler section). If a job fails, open
  `platform/data/shots/` for the screenshot of the failed step, dismiss the notice once in the Instagram page's browser window,
  and run the job again. A `login_required` failure means log in again on the Instagram page.
- **Instagram scheduling limits.** Instagram accepts scheduled posts about 30 days ahead and refuses a time less than 20 minutes
  away. Reels must be 9:16.
- **Out of GPU memory (8 GB).** Only one VoiceStudio can use the GPU. Do not run another copy on the host. Voice jobs wait in
  a queue: `scripts/slot.sh voice 1 -- <command>` (renders use `render 3`). The factory does this for you.
- **The first start is slow.** VoiceStudio and the engine are about 10 to 15 GB. Progress:
  `docker exec <container> cat ~/.config/VoiceStudio/reel-bootstrap.state`. A failed download retries by itself.
- **Docker disk use.** The image is about 8 GB and each rebuild leaves old layers: run `docker image prune` now and then, and
  `docker system df` to see the total. Never `docker volume prune` while the stack is stopped: it deletes the volumes.
- **Port already in use.** Change `HUB_PORT` / `VOICE_PORT` in `.env` and run `./update.sh`.
- **Files made by the container belong to root.** They should belong to you; check `HOST_UID` and `HOST_GID` in `.env`.

## Project layout

    install.sh update.sh uninstall.sh      install, update, remove
    .env.example                           every setting, documented
    platform/                              docker-compose files, Dockerfile, the hub (platform/hub), docs, vendored skills
    scripts/                               voice, slot queue, new-brand, smoke test, helpers
    src/                                   generic Remotion kit (src/kit), cover (src/cover); your reels' code stays outside git
    brand/                                 only _template is public; your brands live here, outside git
    mascot/ reels/ public/                 your characters, reel scripts and captions, sounds (outside git)
    .claude/skills/                        the reel skill and its helpers
    TODO.md                                open items and decisions

Open work and decisions are in [TODO.md](TODO.md). Contributing: [CONTRIBUTING.md](CONTRIBUTING.md). License: MIT
([LICENSE](LICENSE)); third-party components and their licenses: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). This
README and the notices are not legal advice.
