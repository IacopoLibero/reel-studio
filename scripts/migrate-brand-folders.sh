#!/usr/bin/env bash
# Moves your brands to one folder per brand (identity/, mascot/, reels/, questions in the data folder), using a throwaway container so
# the result is written on your disk. It only copies and checks: nothing is deleted until you ask with --remove-old.
#   scripts/migrate-brand-folders.sh [--apply] [--into-data] [--remove-old [--yes]] [--home <folder>]
# Stop the hub first (./uninstall.sh keeps your data; or `docker stop reel-hub`).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/stack-lib.sh"

home="${HOME}/ReelStudio"; pass=()
while [ $# -gt 0 ]; do
  case "$1" in
    --home) home="$(realpath -m "${2:?--home needs a folder}")"; shift 2 ;;
    --apply|--into-data|--remove-old|--yes) pass+=("$1"); shift ;;
    *) die "unknown option $1 (usage: $0 [--apply] [--into-data] [--remove-old [--yes]] [--home <folder>])" ;;
  esac
done

host_home="$(env_get HOST_HOME)"; project="$(env_get COMPOSE_PROJECT_NAME)"; image="$(env_get IMAGE_NAME)"
[ -n "$host_home" ] && [ -n "$project" ] && [ -n "$image" ] || die "run ./install.sh first (no HOST_HOME, COMPOSE_PROJECT_NAME or IMAGE_NAME in .env)"
docker image inspect "$image:latest" >/dev/null 2>&1 || die "image $image:latest not found: run ./install.sh"

docker run --rm --entrypoint bash \
  -u "$(env_get HOST_UID):$(env_get HOST_GID)" -e "HOME=$host_home" \
  -v "$REPO_ROOT:$REPO_ROOT" \
  -v "${project}_hub-node-modules:$REPO_ROOT/platform/hub/node_modules" \
  -v "$home:$home" \
  -w "$REPO_ROOT/platform/hub" "$image:latest" \
  -c "exec npx tsx src/layout/brand-folders-cli.ts --home '$home' ${pass[*]:-}"
