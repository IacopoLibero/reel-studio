#!/usr/bin/env bash
# Create a new brand from brand/_template: brand/<slug>/ (brand.json, style.md, question list, voice notes, logo),
# reels/<slug>/ and platform/data/brands/<slug>/. Nothing that exists is overwritten. The hub lists the brand without a restart.
# usage: scripts/new-brand.sh <slug> [--name "Display Name"] [--website example.com] [--yes]
# <slug> is the folder name: lowercase letters, digits and "-", up to 40 characters.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$ROOT/brand/_template"

id="${1:-}"
if [ -z "$id" ]; then echo "usage: $0 <slug> [--name N] [--website W] [--yes]" >&2; exit 2; fi
shift
[[ "$id" =~ ^[a-z0-9][a-z0-9-]{0,39}$ ]] || { echo "slug must be lowercase letters, digits and - (up to 40 characters)" >&2; exit 2; }
case "$id" in new|api|brands|template|default|settings|admin|global) echo "'$id' is a reserved name" >&2; exit 2 ;; esac
dest="$ROOT/brand/$id"
[ ! -e "$dest" ] || { echo "brand/$id already exists" >&2; exit 1; }

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

cp -R "$TEMPLATE" "$dest"
rm -f "$dest/README.md" "$dest/brand.json"
n="$(esc "$name")"; w="$(esc "$website")"; b="$(esc "$id")"
sed -i \
  -e "s|{{BRAND_NAME}}|$n|g" -e "s|{{WEBSITE}}|$w|g" -e "s|{{BRAND}}|$b|g" \
  -e "s|{{BACKGROUND_HEX}}|#f5f5f0|g" -e "s|{{TEXT_HEX}}|#1a1a1a|g" -e "s|{{ACCENT_HEX}}|#2f6fed|g" -e "s|{{SECOND_ACCENT_HEX}}|#7a4dff|g" \
  -e "s|{{HEADLINE_FONT}}|Oswald|g" -e "s|{{BODY_FONT}}|Inter|g" \
  -e "s|{{OFFER_NAME}}|Try $n|g" -e "s|{{CLOSING_A_LINE}}|Try $n today at $w.|g" -e "s|{{CLOSING_B_LINE}}|Follow me for more tips.|g" -e "s|{{VOICE_NAME}}|the narrator|g" \
  "$dest/style.md" "$dest/reel-questions.md" "$dest/voice-sample.md"

# brand.json from the template, with this brand's identity (JSON-escaped by node).
BRAND_SLUG="$id" BRAND_NAME="$name" BRAND_SITE="$website" TEMPLATE_JSON="$TEMPLATE/brand.json" node -e '
  const fs = require("fs");
  const b = JSON.parse(fs.readFileSync(process.env.TEMPLATE_JSON, "utf8"));
  const name = process.env.BRAND_NAME, site = process.env.BRAND_SITE;
  b.slug = process.env.BRAND_SLUG; b.name = name; b.website = site;
  b.closing.A = { label: "Try " + name, line: "Try " + name + " today at " + site + "." };
  process.stdout.write(JSON.stringify(b, null, 2) + "\n");
' > "$dest/brand.json"

mkdir -p "$ROOT/reels/$id" "$dest/voice" "$ROOT/platform/data/brands/$id"/{daily,analytics,ideas,locks,shots}

cat <<MSG
Created brand/$id (brand.json, style.md, reel-questions.md), reels/$id and platform/data/brands/$id.
Next:
  1. Open brand/$id/brand.json: colours, fonts, closing lines, Instagram account and user id, offer rule, source texts folder.
  2. Put your logo in brand/$id/logo.png and record the voice sample (brand/$id/voice-sample.md).
  3. Add real questions to brand/$id/reel-questions.md.
  4. In the hub pick the brand in the menu, open its Instagram page and log in with that brand's account.
MSG
