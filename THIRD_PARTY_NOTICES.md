# Third-party notices

This repository is MIT-licensed (see LICENSE). It uses, vendors or downloads the following. This list is a good-faith
summary, not legal advice: read each project's own license before you rely on it, especially for commercial use.

## Vendored in this repository

| Component | Where | License |
|---|---|---|
| Ootto content skills (`claude-content-skills`, https://github.com/Ootto-AI/claude-content-skills) | `platform/skills/ootto/` (unmodified, with their LICENSE and `SOURCE.md`) | MIT |
| Remotion agent skills (`remotion-dev/skills`) | `.agents/skills/remotion-*`, linked from `.claude/skills/`, pinned in `skills-lock.json` | No license is declared by that repository (GitHub reports none). Check https://github.com/remotion-dev/skills before you redistribute them; remove `.agents/` and the `remotion-*` links in `.claude/skills/` if unsure. |

## npm dependencies (installed by `npm ci`, not copied here)

- **Remotion** (`remotion`, `@remotion/*`). Remotion has its own license, not MIT: free for individuals, for-profit
  organizations with up to 3 employees, and non-profits; a paid company license is required for larger for-profit companies.
  Check https://www.remotion.dev/license before you use this project to make videos for a company.
- React, Fastify, Playwright, node-pty, ws, zod, Vite, vitest and the other packages in `package.json` and
  `platform/hub/package.json`: each has its own license (mostly MIT or Apache-2.0). `npm ls` and the packages' own files list them.

## Downloaded at install time (not redistributed by this repository)

- **VoiceStudio** (https://github.com/debpalash/VoiceStudio): AGPL-3.0. It is cloned inside the container at first start and
  runs as a separate local service reached over HTTP. It is not copied into this repository or the image. If you modify and
  offer VoiceStudio itself to other people over a network, the AGPL has obligations for that modified VoiceStudio.
  It also installs many Python packages (PyTorch, transformers and others) with their own licenses.
- **VoxCPM2** voice model (`openbmb/VoxCPM2` on Hugging Face) and the `voxcpm` package: the Hugging Face model card states
  Apache-2.0. VoiceStudio's own license review lists it as "unreviewed" for distribution, so read the model card
  (https://huggingface.co/openbmb/VoxCPM2) yourself. Cloning a person's voice needs that person's consent.
- **Blender 5.3** (https://www.blender.org): GPL-2.0-or-later. The official tarball is downloaded while building the image and
  used as a separate program. Output you render with Blender belongs to you.
- **whisper.cpp** (https://github.com/ggml-org/whisper.cpp, built by `@remotion/install-whisper-cpp`): MIT. The OpenAI Whisper
  model weights (medium) are MIT.
- **Playwright and Chromium** (installed in the image): Playwright is Apache-2.0; Chromium is under the BSD-style Chromium
  licenses and many third-party ones. Using Instagram through an automated browser is subject to Instagram's terms; see SECURITY.md.
- **Claude Code** (`@anthropic-ai/claude-code`): Anthropic's commercial terms apply. The hub uses your own login.
- **Composio CLI** (optional): its own terms apply.
- **Ubuntu 24.04** base image, ffmpeg, Xvfb, x11vnc, noVNC, supervisor, uv and the other system packages: their own licenses.
- Fonts named in `brand/_template/brand.json` (Oswald, Inter) are loaded from Google Fonts through `@remotion/google-fonts`: SIL Open Font License.

## Brand content

The repository contains no brand content. Whatever you keep in `brand/`, `reels/`, `mascot/` and your reel compositions is yours,
and you are responsible for the rights to it (logos, voices you clone, sound files, character designs). Check the origin of the
sound effects in `public/a1/` before you reuse them in your own videos.
