#!/usr/bin/env bash
# One-command installer of the Reel Hub: checks the machine, writes .env, builds the image, starts the stack,
# installs VoiceStudio + its voice engine inside the container, and runs a smoke test.
# Safe to run again: every step skips what is already done.
#
#   ./install.sh                 interactive
#   ./install.sh --yes           no questions (CI, scripts)
#   ./install.sh --help          all options
set -euo pipefail
# shellcheck source=scripts/stack-lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/scripts/stack-lib.sh"

YES=0; MODE=""; SMOKE=1; RENDER_MASCOT=0; START=1; WAIT_VOICE=1
OPT_PROJECT=""; OPT_CONTAINER=""; OPT_IMAGE=""; OPT_HUB_PORT=""; OPT_VOICE_PORT=""; OPT_NO_ENGINE=0
usage() {
  cat <<'USAGE'
Usage: ./install.sh [options]
  --yes, -y            do not ask questions; take the safe default (CPU mode when no NVIDIA toolkit is found)
  --gpu | --cpu        force GPU or CPU mode for the voice engine
  --no-start           only check the machine and write .env, do not build or start
  --no-smoke           skip the smoke test at the end
  --no-wait-voice      do not wait for the VoiceStudio download (it continues in the background)
  --no-voice-engine    install VoiceStudio but not its VoxCPM2 engine and model (saves about 15 GB)
  --render-mascot      also render every move of the characters in mascot/ with Blender (about 20 minutes on CPU)
  --project NAME       Docker compose project name, also the prefix of the volumes (default reel-studio)
  --container NAME     container name (default reel-hub)
  --image NAME         image name (default reel-hub)
  --hub-port N         hub port on 127.0.0.1 (default 4000)
  --voice-port N       VoiceStudio port on 127.0.0.1 (default 3900)
The last five make it possible to run a second copy of the stack next to the first one.
USAGE
}
while [ $# -gt 0 ]; do
  case "$1" in
    --yes|-y) YES=1 ;;
    --gpu) MODE=gpu ;;
    --cpu) MODE=cpu ;;
    --no-start) START=0 ;;
    --no-smoke) SMOKE=0 ;;
    --no-wait-voice) WAIT_VOICE=0 ;;
    --no-voice-engine) OPT_NO_ENGINE=1 ;;
    --render-mascot) RENDER_MASCOT=1 ;;
    --project) OPT_PROJECT="${2:?}"; shift ;;
    --container) OPT_CONTAINER="${2:?}"; shift ;;
    --image) OPT_IMAGE="${2:?}"; shift ;;
    --hub-port) OPT_HUB_PORT="${2:?}"; shift ;;
    --voice-port) OPT_VOICE_PORT="${2:?}"; shift ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; die "unknown option: $1" ;;
  esac
  shift
done

ask_yes() { # question, default answer (y/n)
  [ "$YES" -eq 1 ] && { [ "$2" = y ]; return; }
  local a; read -r -p "$1 [$2] " a </dev/tty || return 1
  a="${a:-$2}"; [[ "$a" =~ ^[Yy] ]]
}

# --------------------------------------------------------------------------------------------------
step "1/8 Checking this machine"
[ "$(uname -s)" = Linux ] || die "Linux is required (found $(uname -s)). On Windows use WSL2 with Docker; macOS has no NVIDIA support and is not tested."
[ "$(id -u)" -ne 0 ] || die "Run this as your normal user, not as root: the files it makes would belong to root."
ok "Linux, user $(id -un) (uid $(id -u))"

command -v docker >/dev/null 2>&1 || die "Docker is not installed. Install Docker Engine: https://docs.docker.com/engine/install/ and add yourself to the docker group."
docker info >/dev/null 2>&1 || die "Docker is installed but not usable by $(id -un). Start the daemon (systemctl start docker) and make sure you are in the docker group."
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is missing (the 'docker compose' command). Install the compose plugin: https://docs.docker.com/compose/install/"
ok "Docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '?'), $(docker compose version --short 2>/dev/null)"
command -v curl >/dev/null 2>&1 || die "curl is required."

NVIDIA_RUNTIME=0; GPU_MB=0
if docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q nvidia; then NVIDIA_RUNTIME=1; fi
if command -v nvidia-smi >/dev/null 2>&1; then GPU_MB="$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -n1 | tr -dc '0-9' || true)"; fi
GPU_MB="${GPU_MB:-0}"
if [ -z "$MODE" ]; then
  if [ "$NVIDIA_RUNTIME" -eq 1 ] && [ "$GPU_MB" -gt 0 ]; then
    MODE=gpu; ok "NVIDIA Container Toolkit found, GPU with ${GPU_MB} MiB"
    [ "$GPU_MB" -ge 7500 ] || warn "The voice engine wants about 8 GB of GPU memory; this GPU has ${GPU_MB} MiB. It may run out of memory."
  else
    warn "No usable NVIDIA GPU or NVIDIA Container Toolkit found (toolkit: $([ "$NVIDIA_RUNTIME" -eq 1 ] && echo yes || echo no), nvidia-smi: $([ "$GPU_MB" -gt 0 ] && echo yes || echo no))."
    say "  The voice engine (VoxCPM2) wants a GPU of about 8 GB for good speed. On the CPU it works but is very slow:"
    say "  a 40 second reel voice can take many minutes. Everything else (hub, Blender, Remotion) runs fine on the CPU."
    say "  To use a GPU install the toolkit: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html"
    ask_yes "Continue in CPU mode?" y || die "Stopped. Install the NVIDIA Container Toolkit and run ./install.sh again."
    MODE=cpu
  fi
elif [ "$MODE" = gpu ] && [ "$NVIDIA_RUNTIME" -eq 0 ]; then
  die "--gpu was given but Docker has no nvidia runtime. Install the NVIDIA Container Toolkit (see the README)."
fi

# image 10 GB + VoiceStudio packages (4 GB CPU build, 10 GB CUDA build) + voice engine and model 12 GB (15 GB with CUDA)
NEED_GB=14; [ "$MODE" = gpu ] && NEED_GB=20
if [ "$OPT_NO_ENGINE" -eq 0 ]; then NEED_GB=$((NEED_GB + 12)); [ "$MODE" = gpu ] && NEED_GB=$((NEED_GB + 3)); fi
DOCKER_ROOT="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)"
AVAIL_GB="$(df -Pk "$DOCKER_ROOT" 2>/dev/null | awk 'NR==2{print int($4/1048576)}' || echo 0)"
[ -n "$AVAIL_GB" ] || AVAIL_GB=0
if [ "$AVAIL_GB" -lt "$NEED_GB" ] && [ "$AVAIL_GB" -gt 0 ]; then
  warn "Only ${AVAIL_GB} GB free where Docker stores data ($DOCKER_ROOT); about ${NEED_GB} GB are needed (image 8 GB, voice engine, models)."
  ask_yes "Continue anyway?" n || die "Free some disk space and run ./install.sh again."
else
  ok "Disk: ${AVAIL_GB} GB free for Docker, about ${NEED_GB} GB needed"
fi

# --------------------------------------------------------------------------------------------------
step "2/8 Writing .env"
[ -f "$ENV_FILE" ] || cp "$REPO_ROOT/.env.example" "$ENV_FILE"
chmod 600 "$ENV_FILE"
[ -z "$OPT_PROJECT" ] || env_set COMPOSE_PROJECT_NAME "$OPT_PROJECT"
[ -z "$OPT_CONTAINER" ] || env_set CONTAINER_NAME "$OPT_CONTAINER"
[ -z "$OPT_IMAGE" ] || env_set IMAGE_NAME "$OPT_IMAGE"
[ -z "$OPT_HUB_PORT" ] || env_set HUB_PORT "$OPT_HUB_PORT"
[ -z "$OPT_VOICE_PORT" ] || env_set VOICE_PORT "$OPT_VOICE_PORT"
[ "$OPT_NO_ENGINE" -eq 0 ] || env_set VOICE_ENGINE_INSTALL 0
for kv in COMPOSE_PROJECT_NAME=reel-studio CONTAINER_NAME=reel-hub IMAGE_NAME=reel-hub HUB_PORT=4000 VOICE_PORT=3900 BLENDER_DEVICE=cpu VOICE_ENGINE_INSTALL=1; do
  env_default "${kv%%=*}" "${kv#*=}"
done
env_set HOST_USER "$(id -un)"; env_set HOST_UID "$(id -u)"; env_set HOST_GID "$(id -g)"
env_set HOST_HOME "$HOME"; env_set REEL_ROOT "$REPO_ROOT"
env_default STUDIO_HOME "$HOME/ReelStudio"
if [ "$MODE" = gpu ]; then env_set GPU 1; env_set VOICE_DEVICE gpu; else env_set GPU 0; env_set VOICE_DEVICE cpu; fi
if [ -z "$(env_get TZ)" ]; then
  tz="$( (timedatectl show -p Timezone --value 2>/dev/null || cat /etc/timezone 2>/dev/null || echo Europe/Rome) | head -n1)"
  env_set TZ "${tz:-Europe/Rome}"
fi
if [ -z "$(env_get HUB_TOKEN)" ]; then
  if command -v openssl >/dev/null 2>&1; then tok="$(openssl rand -hex 24)"; else tok="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"; fi
  env_set HUB_TOKEN "$tok"; unset tok
  ok "Created a random hub token (shown once at the end)"
else
  ok "Keeping the hub token already in .env"
fi
ok ".env written (mode 600): mode $MODE, project $(env_get COMPOSE_PROJECT_NAME), hub port $(env_get HUB_PORT), voice port $(env_get VOICE_PORT)"

# ports must be free unless the stack itself is already up
if ! docker ps --format '{{.Names}}' | grep -qx "$(env_get CONTAINER_NAME)"; then
  for p in "$(env_get HUB_PORT)" "$(env_get VOICE_PORT)"; do
    if (command -v ss >/dev/null 2>&1 && ss -ltn "sport = :$p" 2>/dev/null | grep -q LISTEN); then
      die "Port $p is already in use on this machine. Pick another with --hub-port / --voice-port, or stop what uses it."
    fi
  done
  ok "Ports $(env_get HUB_PORT) and $(env_get VOICE_PORT) are free"
fi

# Claude login files must exist as files/folders, otherwise Docker would create them as root-owned directories.
mkdir -p "$HOME/.claude"
[ -e "$HOME/.claude.json" ] || { printf '{}\n' >"$HOME/.claude.json"; chmod 600 "$HOME/.claude.json"; }
# Your files live in the studio folder (workspace/ and data/), outside this repository. Create the folders as you, so Docker does not make them root-owned.
STUDIO="$(studio_home)"; WORKSPACE="$(workspace_dir)"
mkdir -p "$REPO_ROOT/platform/hub/node_modules" "$WORKSPACE/whisper.cpp" "$WORKSPACE/node_modules" "$STUDIO/data"
ok "Your files will live in $STUDIO (workspace/ and data/)"

if [ "$START" -eq 0 ]; then ok "Stopped before building (--no-start). Run ./install.sh again to continue."; exit 0; fi

# --------------------------------------------------------------------------------------------------
step "3/8 Building the image (Blender, Node, Claude Code, Chromium; first time about 5 to 10 minutes)"
dc build
ok "Image built"

step "4/8 Starting the stack"
dc up -d
CONTAINER="$(env_get CONTAINER_NAME)"
ok "Container $CONTAINER started"

step "5/8 Waiting for the hub (it installs its own packages on first start)"
for i in $(seq 1 240); do
  curl -fsS -m 3 "$(hub_url)/api/health" >/dev/null 2>&1 && break
  [ "$i" -eq 240 ] && { dc logs --tail 40 || true; die "The hub did not answer after 20 minutes. Logs: docker exec $CONTAINER tail -n 80 /var/log/reel-hub/hub.log"; }
  sleep 5
done
ok "Hub answers on $(hub_url)"
# The hub has filled the workspace with the program's files by now; the content skills are switched on there.
"$WORKSPACE/scripts/ootto-skills.sh" defaults >/dev/null 2>&1 || warn "Could not switch on the default content skills (scripts/ootto-skills.sh defaults)."

# --------------------------------------------------------------------------------------------------
step "6/8 Installing VoiceStudio and the voice engine inside the container (official sources, downloaded now)"
say "  Source: github.com/debpalash/VoiceStudio (tag $(docker exec "$CONTAINER" printenv VOICESTUDIO_REF)), AGPL-3.0, downloaded not bundled."
say "  The model weights come from Hugging Face (openbmb/VoxCPM2). Nothing from your own machine is copied."
VS_STATE="$HOME/.config/VoiceStudio/reel-bootstrap.state"
vs_state() { docker exec "$CONTAINER" cat "$VS_STATE" 2>/dev/null || echo "starting"; }
if [ "$WAIT_VOICE" -eq 1 ]; then
  last=""; waited=0
  while :; do
    s="$(vs_state)"
    if [ "$s" != "$last" ]; then say "  voice: $s"; last="$s"; fi
    case "$s" in
      ready*) break ;;
      failed) warn "A VoiceStudio step failed; it retries by itself every minute. See: docker exec $CONTAINER tail -n 40 $HOME/.config/VoiceStudio/reel-bootstrap.status" ;;
    esac
    waited=$((waited + 10))
    [ "$waited" -le 14400 ] || { warn "Still installing after 4 hours. It continues in the background; run ./install.sh again to check."; break; }
    # a short heartbeat so a long download does not look frozen
    if [ $((waited % 60)) -eq 0 ]; then
      say "  ... $(docker exec "$CONTAINER" sh -c 'tail -n1 "$HOME/.config/VoiceStudio/reel-bootstrap.status" 2>/dev/null | cut -c1-140' 2>/dev/null || true)"
    fi
    sleep 10
  done
  [ "$(vs_state | cut -c1-5)" != ready ] || ok "VoiceStudio is ready on port $(env_get VOICE_PORT)"
else
  warn "Not waiting for VoiceStudio (--no-wait-voice). Check: docker exec $CONTAINER cat $VS_STATE"
fi

step "7/8 Installing the reel tools (Remotion packages, whisper.cpp with the medium model)"
dexec() { docker exec -u "$(id -u)" -w "$WORKSPACE" "$CONTAINER" "$@"; }
dexec bash -lc 'if [ ! -d node_modules/remotion ]; then npm ci; else echo "node_modules already installed"; fi'
dexec node scripts/setup-whisper.mjs
ok "Remotion and whisper.cpp are ready"
say "Fetching the Remotion agent skills from upstream (not bundled in this repository)..."
dexec bash scripts/install-remotion-skills.sh --quiet || warn "Remotion skills not fetched; retry with: scripts/install-remotion-skills.sh"
if [ "$RENDER_MASCOT" -eq 1 ]; then
  say "  rendering every move of the characters in mascot/ (this takes a while)..."
  for script in "$WORKSPACE"/mascot/*.py; do
    [ -f "$script" ] || { say "  no character script in mascot/: nothing to render"; break; }
    dexec blender -b -P "mascot/$(basename "$script")" -- move all >/dev/null
  done
  ok "Character frames rendered into public/mascot"
fi

step "8/8 Smoke test"
if [ "$SMOKE" -eq 1 ]; then
  dexec bash scripts/smoke-test.sh || warn "The smoke test reported a problem (above). The hub may still work; see the README, section Troubleshooting."
else
  say "  skipped (--no-smoke)"
fi

# --------------------------------------------------------------------------------------------------
TOKEN="$(env_get HUB_TOKEN)"
cat <<EOF

${C_G}${C_B}The Reel Hub is installed.${C_0}

  Open:   $(hub_url)
  Token:  $TOKEN      (the hub asks for it once; it is also in $ENV_FILE, mode 600)

Next steps:
  1. Claude. The hub uses YOUR Claude login. On this computer run   claude   once, log in, and quit.
     The container mounts ~/.claude and ~/.claude.json, so it uses the same login (no API key is stored).
  2. Open the hub, paste the token.
  3. Instagram: in the hub open the Instagram page, press the login button, and type your own password in the window
     that opens (noVNC). The session is saved in $STUDIO/data/brands/<brand>/profile.
  4. Your first brand: in the hub choose "New brand" in the menu, or run   ./scripts/new-brand.sh my-brand
     (your brands live in $STUDIO/workspace, outside git; each brand has its own Instagram login, data and settings).
  5. Optional analytics: install the Composio CLI, run   composio link instagram   and put the numeric Instagram user id
     of the brand in its brand.json (instagram.userId).
  Update later with ./update.sh, remove with ./uninstall.sh.
EOF
