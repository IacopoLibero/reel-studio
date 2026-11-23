# Contributing

Thanks for helping. This project is small: a Remotion + Blender reel factory and a web hub that runs it as a desktop app.

## Set up

The hub runs on the host: `cd platform/hub && npm ci && npm run build`, then `REEL_STUDIO_HOME=/path/to/a/scratch-folder HUB_PORT=4300 node dist/index.js` (the setup screen opens first). The desktop app is in `platform/desktop/` (run it with `electron platform/desktop`); the package is built with `makepkg` in `packaging/arch/`.

    git clone <your fork> && cd reel-studio
    cd platform/hub && npm ci

## Releases

The version is in `package.json` (root), `platform/hub/package.json` (and its lock file), `platform/desktop/package.json` and `pkgver` in `packaging/arch/PKGBUILD`: change them together, add the entry to `CHANGELOG.md`, build the package (`makepkg` in `packaging/arch`), tag `vX.Y.Z` and attach the package and its `SHA256SUMS` to the GitHub release.

## Before you open a pull request

    cd platform/hub
    npx tsc -p tsconfig.json --noEmit && npx tsc -p web/tsconfig.json --noEmit    # types, server and web app
    npm run lint                                                                     # oxlint: errors fail, warnings are shown
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

## Carousels and the Blender kit

The carousel job is `platform/hub/src/carousels/` and its method is the skill `.claude/skills/carousel/SKILL.md`; the 3D kit is `scripts/carousel/blender/` (`kit.py`, `textures.py`, `check.py`). To change or add a prop:

1. Build it in `kit.py` with a function that takes the shared materials `M` and returns a root empty (lathe for round things, one extruded outline for flat things, real materials with `real()`), and add it to `check.py`.
2. Make the textures once: `blender-run -b -P scripts/carousel/blender/textures.py -- /tmp/tex`, then `CAROUSEL_TEX=/tmp/tex CAROUSEL_OUT=/tmp/out blender-run -b -P scripts/carousel/blender/check.py -- <object>` for the four views and `... -- <object> detail` for the close-ups. Read the `WARN` lines: floating parts, sunk objects, faces of zero area.
3. Look at the images and at a 100% crop of a real render before you commit: a texture that is flat there is too fine. Tests do not run Blender; the job is tested with a stand-in AI tool (`tests/fixtures/fake-claude-carousel.mjs`).

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
