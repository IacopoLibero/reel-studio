#!/usr/bin/env bash
# Update the Reel Hub: git pull, rebuild the image, restart the stack. Your .env, your studio folder (brands, reels, data) and the volumes are kept.
# The program's own files in the workspace (Remotion kit, scripts, base skills) are refreshed at start; one you edited is saved in workspace/.reel-studio/overwritten/.
set -euo pipefail
# shellcheck source=scripts/stack-lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/scripts/stack-lib.sh"

[ -f "$ENV_FILE" ] || die "No .env here: run ./install.sh first."
cd "$REPO_ROOT"

step "Pulling the latest code"
if [ -d .git ]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    warn "You have uncommitted changes. git pull will refuse if they conflict; commit or stash them first."
  fi
  git pull --ff-only || die "git pull failed (local commits or conflicts). Resolve it, then run ./update.sh again."
else
  warn "This is not a git checkout; skipping git pull."
fi

step "Rebuilding the image and restarting"
dc up -d --build
CONTAINER="$(env_get CONTAINER_NAME)"
for _ in $(seq 1 120); do curl -fsS -m 3 "$(hub_url)/api/health" >/dev/null 2>&1 && break; sleep 5; done
curl -fsS -m 3 "$(hub_url)/api/health" >/dev/null 2>&1 || die "The hub did not come back. Logs: docker exec $CONTAINER tail -n 80 /var/log/reel-hub/hub.log"
ok "Hub is up on $(hub_url)"
# The hub has just refreshed the program's files in the workspace and installed its packages (platform/docker/prepare-workspace.sh).
WORKSPACE="$(workspace_dir)"
docker exec -u "$(id -u)" -w "$WORKSPACE" "$CONTAINER" bash scripts/install-remotion-skills.sh --quiet || warn "Remotion skills not refreshed; retry with: scripts/install-remotion-skills.sh"
docker exec -u "$(id -u)" -w "$WORKSPACE" "$CONTAINER" bash scripts/smoke-test.sh || warn "The smoke test reported a problem (above)."
