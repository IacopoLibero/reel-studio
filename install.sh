#!/usr/bin/env bash
# Reel Studio installer for Arch Linux.
#
#   curl -fsSL https://reel-studio.iacopolibero.dev/install.sh | bash
#   curl -fsSL https://reel-studio.iacopolibero.dev/install.sh | bash -s -- --version 1.0.3
#
# What it does, in order, and nothing else:
#   1. checks that this is Arch Linux (pacman), x86_64, and that you are not root;
#   2. finds the release on GitHub (the latest, or the one you ask for) and downloads the package
#      and its SHA256SUMS into a new temporary folder;
#   3. checks the package against SHA256SUMS and refuses to go on if they differ;
#   4. installs it with `sudo pacman -U` (pacman asks for your confirmation, unless you pass --yes).
# It never runs anything from the package before pacman installs it, and it removes the temporary folder at the end.
#
# Options:
#   --version X.Y.Z   install that release (default: the latest)
#   --from DIR        use the package and SHA256SUMS found in DIR instead of downloading (for a package you built yourself)
#   --yes             do not ask pacman for confirmation (pacman --noconfirm)
#   --dry-run         download and check, then say what would be installed, without installing
#   -h, --help        show this text
set -euo pipefail

REPO="${REEL_STUDIO_REPO:-IacopoLibero/reel-studio}"
VERSION=""
FROM=""
ASSUME_YES=0
DRY_RUN=0

say() { printf '%s\n' "$*"; }
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
Reel Studio installer for Arch Linux.

  curl -fsSL https://reel-studio.iacopolibero.dev/install.sh | bash
  curl -fsSL https://reel-studio.iacopolibero.dev/install.sh | bash -s -- --version 1.0.3

It checks that this is Arch Linux (pacman, x86_64, not root), downloads the release package and its SHA256SUMS from
GitHub into a temporary folder, checks the package against SHA256SUMS, and installs it with `sudo pacman -U`.
It runs nothing from the package before pacman installs it, and removes the temporary folder at the end.

Options:
  --version X.Y.Z   install that release (default: the latest)
  --from DIR        use the package and SHA256SUMS found in DIR instead of downloading
  --yes             do not ask pacman for confirmation (pacman --noconfirm)
  --dry-run         download and check, then say what would be installed, without installing
  -h, --help        show this text
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --version) [ $# -ge 2 ] || die "--version needs a number, for example 1.0.3"; VERSION="${2#v}"; shift 2 ;;
    --from) [ $# -ge 2 ] || die "--from needs a folder"; FROM="$2"; shift 2 ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
done

[[ -z "$VERSION" || "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "the version must look like 1.0.3"

# 1. The machine
[ "$(uname -s)" = "Linux" ] || die "Reel Studio is for Arch Linux only (this is $(uname -s))."
command -v pacman >/dev/null 2>&1 || die "pacman was not found: Reel Studio is for Arch Linux and its derivatives (CachyOS, Manjaro, EndeavourOS)."
[ "$(uname -m)" = "x86_64" ] || die "the package is for x86_64 (this is $(uname -m))."
[ "$(id -u)" -ne 0 ] || die "do not run this as root: it asks for sudo only for the install step."
command -v sha256sum >/dev/null 2>&1 || die "sha256sum is needed to check the download (package: coreutils)."
if [ "$DRY_RUN" -eq 0 ]; then command -v sudo >/dev/null 2>&1 || die "sudo is needed for pacman -U."; fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/reel-studio-install.XXXXXXXX")"
trap 'rm -rf "$WORK"' EXIT

# 2. The package
if [ -n "$FROM" ]; then
  [ -d "$FROM" ] || die "$FROM is not a folder."
  pkg_src=""
  if [ -n "$VERSION" ]; then
    pkg_src="$(find "$FROM" -maxdepth 1 -name "reel-studio-${VERSION}-*-x86_64.pkg.tar.zst" | sort | tail -n 1)"
  else
    pkg_src="$(find "$FROM" -maxdepth 1 -name 'reel-studio-*-x86_64.pkg.tar.zst' | sort -V | tail -n 1)"
  fi
  [ -n "$pkg_src" ] || die "no reel-studio-*-x86_64.pkg.tar.zst in $FROM."
  [ -f "$FROM/SHA256SUMS" ] || die "$FROM has no SHA256SUMS to check the package against."
  cp "$pkg_src" "$WORK/"
  cp "$FROM/SHA256SUMS" "$WORK/SHA256SUMS"
else
  command -v curl >/dev/null 2>&1 || die "curl is needed to download the package."
  if [ -n "$VERSION" ]; then api="https://api.github.com/repos/$REPO/releases/tags/v$VERSION"; else api="https://api.github.com/repos/$REPO/releases/latest"; fi
  say "Looking for the release on GitHub (${VERSION:-latest})..."
  json="$(curl -fsSL -H 'Accept: application/vnd.github+json' "$api")" || die "could not read the release from $api (is the version published?)."
  urls="$(printf '%s' "$json" | grep -o '"browser_download_url": *"[^"]*"' | sed 's/.*"\(https[^"]*\)"/\1/')"
  pkg_url="$(printf '%s\n' "$urls" | grep -E '/reel-studio-[0-9][^/]*-x86_64\.pkg\.tar\.zst$' | head -n 1 || true)"
  sums_url="$(printf '%s\n' "$urls" | grep -E '/SHA256SUMS$' | head -n 1 || true)"
  [ -n "$pkg_url" ] || die "that release has no package for x86_64."
  [ -n "$sums_url" ] || die "that release has no SHA256SUMS: refusing to install what cannot be checked."
  case "$pkg_url$sums_url" in https://github.com/*|https://objects.githubusercontent.com/*|https://release-assets.githubusercontent.com/*) ;; *) die "the download address is not on GitHub: $pkg_url" ;; esac
  say "Downloading $(basename "$pkg_url")..."
  curl -fSL --progress-bar -o "$WORK/$(basename "$pkg_url")" "$pkg_url" || die "the package could not be downloaded."
  curl -fsSL -o "$WORK/SHA256SUMS" "$sums_url" || die "SHA256SUMS could not be downloaded."
fi

pkg_file="$(find "$WORK" -maxdepth 1 -name 'reel-studio-*-x86_64.pkg.tar.zst' | head -n 1)"
[ -n "$pkg_file" ] || die "the package is not in the temporary folder."
pkg_name="$(basename "$pkg_file")"

# 3. The check
expected="$(grep -F " $pkg_name" "$WORK/SHA256SUMS" | head -n 1 | awk '{print $1}')"
[ -n "$expected" ] || die "SHA256SUMS does not list $pkg_name."
actual="$(sha256sum "$pkg_file" | awk '{print $1}')"
if [ "$expected" != "$actual" ]; then
  die "the checksum of $pkg_name does not match SHA256SUMS (expected $expected, got $actual). Nothing was installed."
fi
say "Checked: $pkg_name matches SHA256SUMS."

# 4. The install
if [ "$DRY_RUN" -eq 1 ]; then
  say "Dry run: would run  sudo pacman -U $pkg_name  (nothing installed)."
  exit 0
fi
args=(-U)
[ "$ASSUME_YES" -eq 1 ] && args+=(--noconfirm)
say "Installing with pacman (sudo asks for your password)..."
sudo pacman "${args[@]}" "$pkg_file"
say ""
say "Done. Start it from the application menu (Reel Studio), or run:  reel-studio"
say "First start downloads the voice and 3D tools (about 30 GB with the best voice on a GPU)."
