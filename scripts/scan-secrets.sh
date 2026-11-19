#!/usr/bin/env bash
# Scan everything `git add -A` would add for secrets and personal data. Prints findings only; exit 1 if any.
# usage: scripts/scan-secrets.sh            (token values are read from .env only to search for them, never printed)
set -u
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 2
list="$(mktemp)"; trap 'rm -f "$list"' EXIT
# regular files only (the skills links are directories seen through symlinks), NUL separated
git add -n -A . | sed "s/^add '//; s/'\$//" | while IFS= read -r f; do [ -f "$f" ] && [ ! -L "$f" ] && printf '%s\0' "$f"; done >"$list"
found=0
scan() { # label, extended regex, optional grep -v pattern for known-benign lines
  local out; out="$(xargs -0 grep -IHnE "$2" <"$list" 2>/dev/null | grep -vE "${3:-^\$a}" | cut -c1-160)"
  if [ -n "$out" ]; then printf '== %s\n%s\n' "$1" "$out"; found=1; fi
}
scan "token or key assignments" '(HUB_TOKEN=[A-Za-z0-9]{12,}|api[_-]?key["'"'"' ]*[:=]["'"'"' ]*[A-Za-z0-9]{16,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|xox[bp]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|(uak|ak)_[A-Za-z0-9_-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY)' 'algolia\.net'
scan "bearer strings" 'Bearer [A-Za-z0-9._-]{20,}'
scan "email addresses" '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}' 'izs\.me|support@iacopolibero\.dev|@remotion|@types|@fastify|@anthropic|@vitejs|@esbuild|@rollup|@babel|@napi|@img|@swc|@tsconfig|@isaacs|@eslint|@humanfs|@humanwhocodes|@jridgewell|@emnapi|@oxc|@rspack|@module-federation|@noble|@vitest|@xterm|@standard|@sinclair|@pkgjs|node_modules|noreply@|hi@voicestudio|users\.noreply'
scan "long hex strings (32+; checksums of public downloads are expected)" '\b[a-f0-9]{40,}\b' 'dacb8264197a3f7fda6001285a5a506fc97ee943881261c2c3bd63c882f22e05|package-lock|skills-lock|SOURCE.md'
scan "personal paths and long numeric ids (Instagram user ids)" '(/home/[a-z]+/|\b[0-9]{16,18}\b|/Users/[A-Za-z]+/)' '/home/(reel|ci|me|user)/|/Users/me/|package-lock|[0-9]{16,18}ms'
scan "phone numbers" '(\+[0-9]{2}[ -]?[0-9]{3}[ -]?[0-9]{6,}|\b3[0-9]{2}[ -]?[0-9]{3}[ -]?[0-9]{4}\b)' 'package-lock|\.json:|startMs|endMs|ms:'
# the real token and Composio key, searched as literal strings (file names only)
for src in "$(sed -n 's/^HUB_TOKEN=//p' .env platform/.env 2>/dev/null | head -n1 | tr -d "\"' \r")" \
           "$(grep -rhoE '(uak|ak)_[A-Za-z0-9_-]{10,}' "$HOME/.composio" 2>/dev/null | head -n1)"; do
  [ -n "$src" ] || continue
  hits="$(xargs -0 grep -IlF -- "$src" <"$list" 2>/dev/null)"
  if [ -n "$hits" ]; then printf '== a real secret value of this machine is in:\n%s\n' "$hits"; found=1; fi
done
[ "$found" -eq 0 ] && echo "secret scan: clean ($(tr -cd '\0' <"$list" | wc -c) files)"
exit "$found"
