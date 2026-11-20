# shellcheck shell=bash
# Shared helpers of install.sh, update.sh and uninstall.sh. Source it; do not run it.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

if [ -t 1 ]; then C_B=$'\033[1m'; C_G=$'\033[32m'; C_Y=$'\033[33m'; C_R=$'\033[31m'; C_0=$'\033[0m'; else C_B=""; C_G=""; C_Y=""; C_R=""; C_0=""; fi
say()  { printf '%s\n' "$*"; }
step() { printf '\n%s== %s%s\n' "$C_B" "$*" "$C_0"; }
ok()   { printf '%s[ok]%s %s\n' "$C_G" "$C_0" "$*"; }
warn() { printf '%s[warn]%s %s\n' "$C_Y" "$C_0" "$*" >&2; }
die()  { printf '%s[error]%s %s\n' "$C_R" "$C_0" "$*" >&2; exit 1; }

# Reads KEY from .env (last assignment wins, quotes and trailing comments removed). Prints nothing if absent.
env_get() {
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n1 | sed -e 's/[[:space:]]*#.*$//' -e "s/^[\"']//" -e "s/[\"']\$//" -e 's/[[:space:]]*$//'
}

# Sets KEY=VALUE in .env: replaces the line if it exists, appends otherwise.
env_set() {
  local key="$1" val="$2" tmp
  [ -f "$ENV_FILE" ] || : >"$ENV_FILE"
  if grep -q "^$key=" "$ENV_FILE"; then
    tmp="$(mktemp "$ENV_FILE.XXXXXX")"
    awk -v k="$key" -v v="$val" 'BEGIN{FS=OFS="="} $1==k && !done {print k "=" v; done=1; next} {print}' "$ENV_FILE" >"$tmp"
    cat "$tmp" >"$ENV_FILE"; rm -f "$tmp"
  else
    printf '%s=%s\n' "$key" "$val" >>"$ENV_FILE"
  fi
}

# Sets KEY only when it is missing or empty.
env_default() { [ -n "$(env_get "$1")" ] || env_set "$1" "$2"; }

# docker compose with this project's env file and the optional files the .env asks for.
dc() {
  local f=(-f "$REPO_ROOT/platform/docker-compose.yml")
  [ "$(env_get GPU)" = 1 ] && f+=(-f "$REPO_ROOT/platform/docker-compose.gpu.yml")
  [ -n "$(env_get BLOG_DIR)$(env_get BLOG_MOUNT)" ] && f+=(-f "$REPO_ROOT/platform/docker-compose.blog.yml")
  [ -n "$(env_get STUDIO_HOME)" ] && f+=(-f "$REPO_ROOT/platform/docker-compose.studio.yml")
  [ -d "$(env_get HOST_HOME)/.composio" ] && f+=(-f "$REPO_ROOT/platform/docker-compose.composio.yml")
  # BLOG_MOUNT defaults to BLOG_DIR; compose substitutes it into the blog file
  BLOG_MOUNT="${BLOG_MOUNT:-$(env_get BLOG_MOUNT)}" docker compose --project-directory "$REPO_ROOT/platform" --env-file "$ENV_FILE" "${f[@]}" "$@"
}

hub_url() { printf 'http://127.0.0.1:%s' "$(env_get HUB_PORT)"; }
