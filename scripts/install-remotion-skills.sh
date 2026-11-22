#!/usr/bin/env bash
# Fetch the official Remotion agent skills from upstream (github.com/remotion-dev/skills) into .claude/skills.
#
# They are NOT part of this repository: the upstream project declares no licence, so we do not redistribute them.
# Downloading them at install time also keeps them current. Run again any time to refresh (the Reel Studio setup runs it).
# It never fails the install: without internet it prints how to retry and exits 0.
#
# usage: scripts/install-remotion-skills.sh [--quiet]
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUIET=0
[ "${1:-}" = "--quiet" ] && QUIET=1
say() { [ "$QUIET" -eq 1 ] || printf '%s\n' "$*"; }

cd "$ROOT" || exit 0
mkdir -p .claude/skills

if ! command -v npx >/dev/null 2>&1; then
  say "npx not found: skipping the Remotion skills. Install Node 22, then run: scripts/install-remotion-skills.sh"
  exit 0
fi

say "Fetching the Remotion skills from github.com/remotion-dev/skills ..."
if out="$(npx --yes skills add remotion-dev/skills -y --skill '*' --agent claude-code 2>&1)"; then
  n="$(find .claude/skills -maxdepth 1 -name 'remotion-*' | wc -l | tr -d ' ')"
  say "Remotion skills ready ($n in .claude/skills)."
else
  say "Could not fetch the Remotion skills (offline, or GitHub unreachable). The install continues without them."
  say "Retry later with: scripts/install-remotion-skills.sh"
  [ "$QUIET" -eq 1 ] || printf '%s\n' "$out" | tail -n 5
fi
exit 0
