#!/bin/bash
# Run by supervisord before the hub starts, as the host user. In the new layout (REEL_ROOT is not the repository):
#   1. copies the program's own files (Remotion kit, scripts, base skills, brand template) into the workspace,
#   2. installs the workspace's Node packages (Remotion) into its node_modules volume when package-lock.json changed.
# In the old layout (REEL_ROOT is the repository) it does nothing.
set -u
P="${REEL_ROOT:?}"; PR="${PROGRAM_ROOT:-$P}"
[ "$P" = "$PR" ] && exit 0
cd "$PR/platform/hub" || exit 1
node dist/layout/prepare.js || { echo "[prepare-workspace] could not fill the workspace" >&2; exit 1; }
cd "$P" || exit 1
if [ -f package.json ]; then
  h=$(sha1sum package-lock.json 2>/dev/null | cut -d" " -f1)
  if [ ! -f "node_modules/.ws-$h" ]; then
    echo "[prepare-workspace] installing the workspace packages"
    (npm ci || npm install) || { echo "[prepare-workspace] npm install failed" >&2; exit 1; }
    rm -f node_modules/.ws-*; touch "node_modules/.ws-$h"
  fi
fi
