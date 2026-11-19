#!/usr/bin/env bash
# Host-side notifier for the Reel Hub (run by ~/.config/systemd/user/reel-hub-notify.service).
# Every 60 s: asks the hub for unseen notifications, shows each one as a system notification with an
# "Open" action (opens the Daily page), and marks it seen. The token is read from platform/.env here, never from the unit.
# Usage: reel-hub-notify.sh           loop forever
#        reel-hub-notify.sh --once    one poll, then exit (used for tests)
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$HERE/../.env" ]; then DEFAULT_ENV="$HERE/../.env"; else DEFAULT_ENV="$HERE/../platform/.env"; fi
ENV_FILE="${REEL_HUB_ENV:-$DEFAULT_ENV}"
HUB_PORT_ENV="$(sed -n 's/^HUB_PORT=//p' "$ENV_FILE" 2>/dev/null | head -n1 | tr -d "\"'\r")"
HUB="${REEL_HUB_URL:-http://127.0.0.1:${HUB_PORT_ENV:-4000}}"
INTERVAL="${REEL_HUB_NOTIFY_INTERVAL:-60}"
LOG="${REEL_HUB_NOTIFY_LOG:-${XDG_STATE_HOME:-$HOME/.local/state}/reel-hub-notify.log}"
mkdir -p "$(dirname "$LOG")"

log() { printf '%s %s\n' "$(date -Is)" "$*" >>"$LOG"; }

token() { sed -n 's/^HUB_TOKEN=//p' "$ENV_FILE" 2>/dev/null | head -n1 | tr -d "\"'\r"; }

api() { # method path
  curl -fsS --max-time 10 -X "$1" -H "Authorization: Bearer $(token)" "$HUB$2"
}

show() { # id title body url
  local id="$1" title="$2" body="$3" url="$4" action
  # The action waits for a click, so it runs in the background; the notification is marked seen right away so it is shown once.
  (
    action="$(notify-send -u normal -a "Reel Hub" -A open=Open -t 600000 "$title" "$body" 2>>"$LOG")" || true
    log "notification $id closed, action='${action:-none}'"
    if [ "${action:-}" = "open" ]; then xdg-open "$HUB$url" >/dev/null 2>&1 || log "xdg-open failed"; fi
  ) &
  api POST "/api/notifications/$id/seen" >/dev/null && log "shown and marked seen: $id ($title)" || log "could not mark $id seen"
}

poll() {
  local list n i
  if ! list="$(api GET "/api/notifications?unseen=1")"; then log "hub not reachable or token rejected"; return 0; fi
  n="$(printf '%s' "$list" | jq 'length' 2>/dev/null || echo 0)"
  for ((i = 0; i < n; i++)); do
    show "$(printf '%s' "$list" | jq -r ".[$i].id")" "$(printf '%s' "$list" | jq -r ".[$i].title")" \
      "$(printf '%s' "$list" | jq -r ".[$i].body")" "$(printf '%s' "$list" | jq -r ".[$i].url")"
  done
}

[ -n "$(token)" ] || { log "no HUB_TOKEN in $ENV_FILE"; echo "no HUB_TOKEN in $ENV_FILE" >&2; exit 1; }
log "started (hub $HUB, every ${INTERVAL}s)"
if [ "${1:-}" = "--once" ]; then poll; wait; exit 0; fi
while true; do poll; sleep "$INTERVAL"; done
