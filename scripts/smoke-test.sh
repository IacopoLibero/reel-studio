#!/usr/bin/env bash
# Smoke test, run INSIDE the container (install.sh and update.sh do it with docker exec): hub, Blender, Remotion,
# VoiceStudio and Claude are present and answer. Exit code 0 = all required checks passed.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
fail=0
pass() { echo "  [ok]   $1"; }
bad()  { echo "  [FAIL] $1"; fail=1; }
note() { echo "  [info] $1"; }

echo "Smoke test"
if curl -fsS -m 5 http://127.0.0.1:4000/api/health >/dev/null 2>&1; then pass "hub health"; else bad "hub health (port 4000)"; fi

if blender --version >/dev/null 2>&1; then pass "Blender starts ($(blender --version 2>/dev/null | head -n1))"; else bad "Blender does not start"; fi
# A character render is only tried when a character script exists on this machine (characters are not part of the public tree).
script="$(find brand -mindepth 3 -maxdepth 3 -path '*/mascot/*.py' 2>/dev/null | sort | head -n1)"
if [ -n "$script" ]; then
  out="${TMPDIR:-/tmp}/mascot-stills/still-idle-0-0.png"
  rm -f "$out"
  if blender -b -P "$script" -- still idle >/tmp/smoke-blender.log 2>&1 && [ -s "$out" ]; then
    pass "Blender rendered a character still ($(stat -c %s "$out") bytes)"
  else bad "Blender still (log: /tmp/smoke-blender.log)"; fi
else note "no character in brand/*/mascot/: character render skipped"; fi

if [ -d node_modules/remotion ]; then
  rm -f /tmp/smoke-remotion.png
  if timeout 600 npx remotion still src/index.ts MyComp /tmp/smoke-remotion.png >/tmp/smoke-remotion.log 2>&1 && [ -s /tmp/smoke-remotion.png ]; then
    pass "Remotion rendered a still"
  else bad "Remotion still (log: /tmp/smoke-remotion.log)"; fi
else bad "Remotion packages are not installed (run npm ci in the project)"; fi

if curl -fsS -m 5 http://127.0.0.1:3900/health 2>/dev/null | grep -q '"status":"ok"'; then
  pass "VoiceStudio /health"
else
  st="$(cat "$HOME/.config/VoiceStudio/reel-bootstrap.state" 2>/dev/null || echo unknown)"
  bad "VoiceStudio does not answer yet (install state: $st)"
fi

if command -v claude >/dev/null 2>&1; then
  pass "Claude Code present ($(claude --version 2>/dev/null | head -n1))"
  if [ -s "$HOME/.claude/.credentials.json" ] || [ -s "$HOME/.claude.json" ] && grep -q oauthAccount "$HOME/.claude.json" 2>/dev/null; then
    pass "a Claude login is mounted"
  else
    note "no Claude login found yet: run 'claude' once on the host and log in (the container shares ~/.claude)"
  fi
else bad "Claude Code is not installed in the image"; fi

[ "$fail" -eq 0 ] && echo "Smoke test passed." || echo "Smoke test: some checks failed."
exit "$fail"
