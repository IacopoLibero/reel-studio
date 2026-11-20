#!/usr/bin/env bash
# Copies your files from the old single-folder layout into the studio folder (workspace/ and data/), using a throwaway container
# so the Instagram login (in a Docker volume) can be read and the result is written on your disk, not inside a container.
# It only copies: nothing is moved or deleted. Without --apply it only shows the plan.
#   scripts/migrate-layout.sh [--apply] [--home <folder>] [--ignore-browser-lock]
# Stop the hub first (./uninstall.sh keeps your data; or `docker stop reel-hub`): a running browser or job makes the copy unreliable.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/stack-lib.sh"

home="${HOME}/ReelStudio"; pass=()
while [ $# -gt 0 ]; do
  case "$1" in
    --home) home="$(realpath -m "${2:?--home needs a folder}")"; shift 2 ;;
    --apply|--ignore-browser-lock) pass+=("$1"); shift ;;
    *) die "unknown option $1 (usage: $0 [--apply] [--home <folder>] [--ignore-browser-lock])" ;;
  esac
done

host_home="$(env_get HOST_HOME)"; project="$(env_get COMPOSE_PROJECT_NAME)"; image="$(env_get IMAGE_NAME)"
[ -n "$host_home" ] && [ -n "$project" ] && [ -n "$image" ] || die "run ./install.sh first (no HOST_HOME, COMPOSE_PROJECT_NAME or IMAGE_NAME in .env)"
docker image inspect "$image:latest" >/dev/null 2>&1 || die "image $image:latest not found: run ./install.sh"
mkdir -p "$home"

docker run --rm --entrypoint bash \
  -u "$(env_get HOST_UID):$(env_get HOST_GID)" -e "HOME=$host_home" -e "HUB_DATA=$REPO_ROOT/platform/data" \
  -v "$REPO_ROOT:$REPO_ROOT" \
  -v "${project}_hub-node-modules:$REPO_ROOT/platform/hub/node_modules" \
  -v "${project}_chrome-profile:/data/chrome-profile:ro" \
  -v "$home:$home" \
  -w "$REPO_ROOT/platform/hub" "$image:latest" \
  -c "exec npx tsx src/layout/cli.ts --home '$home' ${pass[*]:-}"
