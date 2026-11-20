#!/usr/bin/env bash
# Remove the Reel Hub stack of THIS checkout (its container, network and image). Asks before deleting the volumes
# (Instagram login, hub history, VoiceStudio with its models). The repository, brands, reels and .env are never deleted.
set -euo pipefail
# shellcheck source=scripts/stack-lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/scripts/stack-lib.sh"

# --yes: no questions, volumes are kept. --delete-volumes (with --yes): also delete the volumes, no questions.
YES=0; DELVOL=0
for a in "$@"; do
  case "$a" in
    --yes|-y) YES=1 ;;
    --delete-volumes) DELVOL=1 ;;
    *) die "unknown option: $a (use --yes and --delete-volumes)" ;;
  esac
done
[ -f "$ENV_FILE" ] || die "No .env here: nothing to uninstall."
PROJECT="$(env_get COMPOSE_PROJECT_NAME)"; CONTAINER="$(env_get CONTAINER_NAME)"; IMAGE="$(env_get IMAGE_NAME)"
say "This removes the container '$CONTAINER', its network and the image '$IMAGE:latest' (project '$PROJECT')."
if [ "$YES" -eq 0 ]; then
  read -r -p "Continue? [y/N] " a </dev/tty; [[ "$a" =~ ^[Yy] ]] || { say "Nothing changed."; exit 0; }
fi

step "Stopping and removing the stack"
dc down --remove-orphans
if docker image rm "$IMAGE:latest" >/dev/null 2>&1; then ok "Image removed"; else warn "Image $IMAGE:latest was not removed (not found or in use)."; fi

VOLUMES="$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT")"
if [ -n "$VOLUMES" ]; then
  say ""; say "Docker volumes of this project (data that is NOT in the repository):"
  # shellcheck disable=SC2001
  printf '%s\n' "$VOLUMES" | sed 's/^/  /'
  say "  Only caches and models: voicestudio-config / omnivoice-data / hf-cache = VoiceStudio and its models (about 20 GB, downloadable again), workspace-node-modules, whisper-cpp."
say "  Your brands, reels, hub data and Instagram logins are NOT here: they are in your studio folder (STUDIO_HOME in .env) and are never deleted by this script."
  del=n
  if [ "$DELVOL" -eq 1 ] && [ "$YES" -eq 1 ]; then del=y
  elif [ "$YES" -eq 0 ]; then read -r -p "Delete these volumes too? This cannot be undone. [y/N] " del </dev/tty; fi
  if [[ "$del" =~ ^[Yy] ]]; then
    # shellcheck disable=SC2086
    docker volume rm $VOLUMES >/dev/null && ok "Volumes deleted"
  else
    ok "Volumes kept. ./install.sh will reuse them."
  fi
fi
say "Done. The repository and .env are untouched; delete them by hand if you want everything gone."
