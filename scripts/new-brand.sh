#!/usr/bin/env bash
# Create a new brand from brand/_template (in the program folder): brand/<slug>/identity/ (brand.json, style.md), brand/<slug>/reels/,
# and the hub's data folder of the brand with its question list. Nothing that exists is overwritten. The hub lists the brand without a restart.
# usage: ./scripts/new-brand.sh <slug> [--name "Display Name"] [--website example.com] [--yes]   (run it from the repository)
# <slug> is the folder name: lowercase letters, digits and "-", up to 40 characters.
set -euo pipefail
SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Your brands live in the workspace of your studio folder, their hub data next to it: the folder comes from STUDIO_HOME in .env. HUB_DATA overrides the data folder.
studio="$(sed -n 's/^STUDIO_HOME=//p' "$SELF/.env" 2>/dev/null | tail -n1 | tr -d "\"'")"
if [ -n "$studio" ]; then ROOT="$studio/workspace"; DATA="$studio/data"
else echo "STUDIO_HOME is not set in .env: run ./install.sh first (old install: scripts/migrate-layout.sh)." >&2; exit 1; fi
DATA="${HUB_DATA:-$DATA}"
TEMPLATE="$SELF/brand/_template"
[ -d "$TEMPLATE" ] || { echo "$TEMPLATE not found: run this script from the repository (./scripts/new-brand.sh), not from the workspace." >&2; exit 1; }

id="${1:-}"
if [ -z "$id" ]; then echo "usage: $0 <slug> [--name N] [--website W] [--yes]" >&2; exit 2; fi
shift
[[ "$id" =~ ^[a-z0-9][a-z0-9-]{0,39}$ ]] || { echo "slug must be lowercase letters, digits and - (up to 40 characters)" >&2; exit 2; }
case "$id" in new|api|brands|template|default|settings|admin|global) echo "'$id' is a reserved name" >&2; exit 2 ;; esac
dest="$ROOT/brand/$id"
[ ! -e "$dest" ] || { echo "brand/$id already exists" >&2; exit 1; }
[ ! -e "$DATA/brands/$id" ] || { echo "$DATA/brands/$id already exists" >&2; exit 1; }

name="$id"; website="example.com"; yes=0
while [ $# -gt 0 ]; do
  case "$1" in
    --name) name="${2:?}"; shift 2 ;;
    --website) website="${2:?}"; shift 2 ;;
    --yes) yes=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
if [ "$yes" -eq 0 ] && [ -t 0 ]; then
  read -r -p "Brand name [$name]: " a; name="${a:-$name}"
  read -r -p "Website [$website]: " a; website="${a:-$website}"
fi

# Escape a value for the replacement side of sed (| is the delimiter).
esc() { printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g'; }

mkdir -p "$dest/identity" "$dest/reels" "$DATA/brands/$id"/{daily,analytics,ideas,locks}
cp "$TEMPLATE/style.md" "$dest/identity/style.md"
cp "$TEMPLATE/reel-questions.md" "$DATA/brands/$id/reel-questions.md"
n="$(esc "$name")"; w="$(esc "$website")"; b="$(esc "$id")"
sed -i \
  -e "s|{{BRAND_NAME}}|$n|g" -e "s|{{WEBSITE}}|$w|g" -e "s|{{BRAND}}|$b|g" \
  -e "s|{{BACKGROUND_HEX}}|#f5f5f0|g" -e "s|{{TEXT_HEX}}|#1a1a1a|g" -e "s|{{ACCENT_HEX}}|#2f6fed|g" -e "s|{{SECOND_ACCENT_HEX}}|#7a4dff|g" \
  -e "s|{{HEADLINE_FONT}}|Oswald|g" -e "s|{{BODY_FONT}}|Inter|g" \
  -e "s|{{OFFER_NAME}}|Try $n|g" -e "s|{{CLOSING_A_LINE}}|Try $n today at $w.|g" -e "s|{{CLOSING_B_LINE}}|Follow me for more tips.|g" -e "s|{{VOICE_NAME}}|the narrator|g" \
  -e "s|{{LOGO_PATH}}|brand/$b/identity/logo.png|g" -e "s|{{VOICE_BASE}}|brand/$b/identity/voice|g" \
  "$dest/identity/style.md" "$DATA/brands/$id/reel-questions.md"

# brand.json from the template, with this brand's identity (JSON-escaped by node).
BRAND_SLUG="$id" BRAND_NAME="$name" BRAND_SITE="$website" TEMPLATE_JSON="$TEMPLATE/brand.json" node -e '
  const fs = require("fs");
  const b = JSON.parse(fs.readFileSync(process.env.TEMPLATE_JSON, "utf8"));
  const name = process.env.BRAND_NAME, site = process.env.BRAND_SITE;
  b.slug = process.env.BRAND_SLUG; b.name = name; b.website = site;
  b.closing.A = { label: "Try " + name, line: "Try " + name + " today at " + site + "." };
  process.stdout.write(JSON.stringify(b, null, 2) + "\n");
' > "$dest/identity/brand.json"

cat <<MSG
Created $ROOT/brand/$id (identity/brand.json, identity/style.md, reels/) and $DATA/brands/$id (reel-questions.md and the hub's data).
Next:
  1. Open brand/$id/identity/brand.json: colours, fonts, closing lines, Instagram account and user id, offer rule, source texts folder.
  2. Put your logo in brand/$id/identity/logo.png (a PNG; without one, covers have no logo frame) and record the voice sample
     as .claude/skills/reel/voice-sample.md describes (identity/voice.wav and identity/voice.txt).
  3. Add real questions to $DATA/brands/$id/reel-questions.md.
  4. In the hub pick the brand in the menu, open its Instagram page and log in with that brand's account.
MSG
