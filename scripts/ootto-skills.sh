#!/usr/bin/env bash
# Turn the vendored Ootto content skills on or off for Claude Code in this project.
# usage: scripts/ootto-skills.sh list | defaults | enable <name...> | disable <name...>
# A skill is "on" when .claude/skills/ootto-<name> is a symlink to platform/skills/ootto/<name>.
# Hidden skills (manifest "hidden": true) are never enabled and their links are removed. Our own skills
# (reel, reel-hooks, ...) live in .claude/skills/ directly, are not symlinks and are not touched here.
# The links are local state (ignored by git); the skills and manifest.json are in the repo.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/platform/skills/ootto"
DST="$ROOT/.claude/skills"
MANIFEST="$SRC/manifest.json"
mkdir -p "$DST"

valid() { [ -f "$SRC/$1/SKILL.md" ] || { echo "unknown skill: $1" >&2; return 1; }; }
on()    { [ -L "$DST/ootto-$1" ]; }
is_hidden() { python3 -I - "$MANIFEST" "$1" <<'PY'
import json, sys
sys.exit(0 if any(s["name"] == sys.argv[2] and s.get("hidden") for s in json.load(open(sys.argv[1]))["skills"]) else 1)
PY
}
enable()  { valid "$1"; if is_hidden "$1"; then echo "hidden skill, not enabled: $1" >&2; return 0; fi; on "$1" || ln -s "../../platform/skills/ootto/$1" "$DST/ootto-$1"; }
disable() { valid "$1"; ! on "$1" || rm "$DST/ootto-$1"; }

case "${1:-list}" in
  list)
    python3 -I - "$MANIFEST" "$DST" <<'PY'
import json, os, sys
m = json.load(open(sys.argv[1]))
out = [{"name": s["name"], "risk": s["risk"], "reason": s["reason"], "defaultEnabled": s["defaultEnabled"],
        "hidden": bool(s.get("hidden")), "group": s.get("group", "kept"),
        "enabled": os.path.islink(os.path.join(sys.argv[2], "ootto-" + s["name"]))} for s in m["skills"]]
print(json.dumps(out))
PY
    ;;
  defaults)
    python3 -I - "$MANIFEST" <<'PY' | while read -r n; do enable "$n"; done
import json, sys
for s in json.load(open(sys.argv[1]))["skills"]:
    if s["defaultEnabled"] and not s.get("hidden"):
        print(s["name"])
PY
    # remove the links of hidden skills
    python3 -I - "$MANIFEST" <<'PY' | while read -r n; do disable "$n"; done
import json, sys
for s in json.load(open(sys.argv[1]))["skills"]:
    if s.get("hidden"):
        print(s["name"])
PY
    ;;
  enable)  shift; for n in "$@"; do enable "$n"; done ;;
  disable) shift; for n in "$@"; do disable "$n"; done ;;
  *) echo "usage: $0 list|defaults|enable <name...>|disable <name...>" >&2; exit 2 ;;
esac
