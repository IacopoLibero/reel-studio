# Contributing

Thanks for helping. This project is small: a Remotion + Blender reel factory and a web hub that runs it as a desktop app.

## Set up

The hub runs on the host: `cd platform/hub && npm ci && npm run build`, then `REEL_STUDIO_HOME=/path/to/a/scratch-folder HUB_PORT=4300 node dist/index.js` (the setup screen opens first). The desktop app is in `platform/desktop/` (run it with `electron platform/desktop`); the package is built with `makepkg` in `packaging/arch/`.

    git clone <your fork> && cd reel-studio
    cd platform/hub && npm ci

## Before you open a pull request

    cd platform/hub
    npx tsc -p tsconfig.json --noEmit && npx tsc -p web/tsconfig.json --noEmit    # types, server and web app
    npx vitest run                                                                   # all tests must pass
    (cd src/scheduler && npm ci && npx playwright install chromium && npx vitest run)   # Instagram scheduler, needs Chromium
    cd ../.. && npx tsc --noEmit                                                     # the Remotion project
    shellcheck -x -S warning scripts/*.sh packaging/arch/reel-studio

CI runs the same checks (`.github/workflows/ci.yml`).

## Conventions

- Tests first for hub code (`platform/hub/tests`, `src/**/test`). Keep files under 400 lines, functions short.
- Comments in English, no emojis in code or docs. Commit messages follow Conventional Commits: `feat:`, `fix:`, `docs:`, ...
- No machine-specific paths, no personal ids, no brand names in the generic code: use environment variables or the brand's own files.
  Brand content belongs in the brand's folder in your data folder, `data/brands/<name>/`.
- Never commit secrets (tokens, anything from your studio folder). Run a quick `grep -rn "HUB_TOKEN=" .` before you push.

## Using the project for your own brand

The repository holds no brand. Your brands live in your studio folder (`~/ReelStudio/data/brands/<slug>/` with `identity/`, `mascot/` and `reels/`; the branded compositions are in `~/ReelStudio/workspace/src/`),
outside this repository. Create one with the app's "New brand".
The generic platform (`platform/`, `scripts/`, `src/kit`) works with no brand present.

## Documentation and screenshots

The README and `platform/docs/` describe what the code does today: change them in the same pull request as the behaviour.
The images in `docs/images/` are screenshots of a scratch hub with an **invented brand** (Acme Bakery) and two hand-drawn diagrams (`*.svg`).
Never put a real brand, account, number, path or token in a screenshot. To retake one:

1. Copy the public tree (`git ls-files -c -o --exclude-standard`) to a scratch folder and create a brand there with `BrandRegistry.create`
   (`platform/hub/src/brands/registry.ts`) or the hub's own "New brand" page.
2. Add invented questions, reels (a cover from `npx remotion still src/index.ts Cover`, a short MP4 made with ffmpeg), a scheduled-posts fixture
   (`HUB_SCHEDULER_MODULE` pointing at a stand-in module like `platform/hub/tests/fixtures/fake-scheduler.mjs`), an analytics snapshot and a daily plan under the scratch data folder.
3. Start a second hub on another port with `HUB_PORT`, `HUB_TOKEN`, `HUB_DATA` and `REEL_ROOT` pointing at the scratch copy and `HUB_CLAUDE_BIN=/bin/false`
   (see "Running the hub without the app" in `platform/README.md`). Never use a running installation for screenshots.
4. Take the screenshots with Playwright at 1440 x 900, look at every one, keep each under about 250 KB, then delete the scratch folder.
