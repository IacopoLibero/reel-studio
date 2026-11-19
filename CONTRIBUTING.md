# Contributing

Thanks for helping. This project is small: a Remotion + Blender reel factory and a web hub that runs it in Docker.

## Set up

    git clone <your fork> && cd reel-studio
    ./install.sh --yes --cpu --no-voice-engine     # the full stack without the 15 GB voice engine, enough to work on the hub
    cd platform/hub && npm ci

## Before you open a pull request

    cd platform/hub
    npx tsc -p tsconfig.json --noEmit && npx tsc -p web/tsconfig.json --noEmit    # types, server and web app
    npx vitest run                                                                   # all tests must pass
    (cd src/scheduler && npm ci && npx playwright install chromium && npx vitest run)   # Instagram scheduler, needs Chromium
    cd ../.. && npx tsc --noEmit                                                     # the Remotion project
    shellcheck -x -S warning install.sh update.sh uninstall.sh scripts/*.sh

CI runs the same checks (`.github/workflows/ci.yml`).

## Conventions

- Tests first for hub code (`platform/hub/tests`, `src/**/test`). Keep files under 400 lines, functions short.
- Comments in English, no emojis in code or docs. Commit messages follow Conventional Commits: `feat:`, `fix:`, `docs:`, ...
- No machine-specific paths, no personal ids, no brand names in the generic code: use `.env` (see `.env.example`).
  Brand content belongs in `brand/<name>/`.
- Never commit secrets (`.env`, tokens, anything under `platform/data/`). Run a quick `grep -rn "HUB_TOKEN=" .` before you push.

## Using the project for your own brand

The repository holds no brand. Your brands live in `brand/<slug>/`, `reels/`, `mascot/` and the branded compositions in `src/`,
all git-ignored by one rule block in `.gitignore`. Create one with `./scripts/new-brand.sh my-brand` or the hub's "New brand".
The generic platform (`platform/`, `scripts/`, `install.sh`, `src/kit`) works with no brand present.
