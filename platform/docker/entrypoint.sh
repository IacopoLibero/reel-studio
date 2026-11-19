#!/bin/bash
# Container start: create the host's user inside, hand the named volumes to it, then run supervisord.
# All paths are the same as on the host: HOST_HOME is the host HOME, REEL_ROOT the project folder.
set -u
U="${HOST_USER:?}"; UID_="${HOST_UID:?}"; GID_="${HOST_GID:?}"; H="${HOST_HOME:?}"; P="${REEL_ROOT:?}"

getent group "$GID_" >/dev/null || groupadd -g "$GID_" "$U"
if ! getent passwd "$UID_" >/dev/null; then
  useradd -M -u "$UID_" -g "$GID_" -s /bin/bash -d "$H" "$U"
fi
# the login name supervisord is told to use must exist, even if the uid already had another name
getent passwd "$U" >/dev/null || U="$(getent passwd "$UID_" | cut -d: -f1)"
export HOST_USER="$U"

# Mount points are created root-owned by Docker: hand the ones that live in the container (never a host bind mount) to the user.
own() { [ -d "$1" ] && [ "$(stat -c %u "$1")" != "$UID_" ] && chown "$UID_:$GID_" "$1" 2>/dev/null; return 0; }
mkdir -p "$H" "$H/.cache" "$H/.config" "$H/.local/share/uv"
own "$H"
d="$(dirname "$P")"; while [ "$d" != "/" ] && [ "$d" != "$H" ] && [ "$d" != "." ]; do own "$d"; d="$(dirname "$d")"; done
for v in "$H/.cache" "$H/.cache/huggingface" "$H/.cache/uv" "$H/.config" "$H/.local" "$H/.local/share" "$H/.local/share/uv" "$H/.local/share/uv/python" \
         /data /data/chrome-profile "$H/.config/VoiceStudio" "$H/.omnivoice" "$P/whisper.cpp" "$P/platform/hub/node_modules"; do
  own "$v"
done
mkdir -p /data/chrome-profile /data/shots /var/log/reel-hub
chown -R "$UID_:$GID_" /data /var/log/reel-hub 2>/dev/null
ln -sfn "$P" /workspace

# whisper.cpp is rebuilt in the container (host binaries are not reusable): sources+model live in a volume
if [ -f "$P/whisper.cpp/Makefile" ] && [ ! -f "$P/whisper.cpp/.built-in-container" ]; then
  echo "[entrypoint] building whisper.cpp"
  su "$U" -c "cd '$P/whisper.cpp' && rm -f *.o main quantize server && make -j\$(nproc) main >/tmp/whisper-build.log 2>&1 && touch .built-in-container" \
    || echo "[entrypoint] whisper build FAILED, see /tmp/whisper-build.log"
fi
exec "$@"
