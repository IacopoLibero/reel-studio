#!/usr/bin/env bash
# Installs (or removes) the systemd user unit that runs scripts/reel-hub-notify.sh,
# so the daily loop's desktop alerts start with your session.
#   scripts/install-notifier.sh              install and start
#   scripts/install-notifier.sh --uninstall  stop and remove
#   scripts/install-notifier.sh --print      show the unit without installing
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT="$UNIT_DIR/reel-hub-notify.service"

unit_text() {
  cat <<EOF
[Unit]
Description=Reel Hub: system notifications for the daily loop
After=graphical-session.target

[Service]
Type=simple
ExecStart=$REPO_ROOT/scripts/reel-hub-notify.sh
Restart=always
RestartSec=15

[Install]
WantedBy=default.target
EOF
}

case "${1:-}" in
  --print) unit_text; exit 0 ;;
  --uninstall)
    systemctl --user disable --now reel-hub-notify.service 2>/dev/null || true
    rm -f "$UNIT"
    systemctl --user daemon-reload
    echo "removed $UNIT"
    exit 0 ;;
  "") ;;
  *) echo "usage: $0 [--uninstall|--print]" >&2; exit 2 ;;
esac

missing=()
for c in notify-send jq curl systemctl; do command -v "$c" >/dev/null || missing+=("$c"); done
[ ${#missing[@]} -eq 0 ] || { echo "missing tools: ${missing[*]}" >&2; exit 1; }
[ -x "$REPO_ROOT/scripts/reel-hub-notify.sh" ] || { echo "$REPO_ROOT/scripts/reel-hub-notify.sh is not executable" >&2; exit 1; }
grep -q '^HUB_TOKEN=.\+' "$REPO_ROOT/platform/.env" 2>/dev/null || echo "warning: no HUB_TOKEN in platform/.env yet; the notifier will log it and exit until you set one" >&2

mkdir -p "$UNIT_DIR"
unit_text >"$UNIT"
systemctl --user daemon-reload
systemctl --user enable --now reel-hub-notify.service
echo "installed $UNIT"
systemctl --user --no-pager status reel-hub-notify.service | sed -n 1,4p
