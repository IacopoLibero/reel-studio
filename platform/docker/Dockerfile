# syntax=docker/dockerfile:1
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8 TZ=Europe/Rome

# base tools, build chain (node-pty, whisper.cpp), media, display, GL
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg xz-utils git tmux supervisor sudo tzdata locales \
    build-essential make g++ python3 python3-pip python3-venv pkg-config \
    ffmpeg fonts-liberation fonts-noto-color-emoji fonts-dejavu-core fonts-noto-core \
    xvfb x11vnc novnc websockify x11-utils procps less jq rsync unzip \
    libgl1 libegl1 libglx-mesa0 libgl1-mesa-dri libegl-mesa0 libgbm1 libglu1-mesa mesa-utils \
    libxi6 libxkbcommon0 libxxf86vm1 libxfixes3 libxrender1 libsm6 libice6 libxrandr2 libxcursor1 libxinerama1 libwayland-client0 \
    libvulkan1 \
  && rm -rf /var/lib/apt/lists/*

# Node 22 (NodeSource, official)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y --no-install-recommends nodejs && rm -rf /var/lib/apt/lists/*

# uv (official image binary)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Claude Code CLI + Playwright Chromium with all system libs (also used by Remotion's headless Chrome)
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/pw
RUN npm i -g @anthropic-ai/claude-code playwright \
  && npx playwright install --with-deps chromium \
  && chmod -R a+rX /opt/pw && rm -rf /var/lib/apt/lists/*

# Blender 5.3.0 (official tarball, checksum verified)
ARG BLENDER_URL=https://download.blender.org/release/Blender5.3/blender-5.3.0-linux-x64.tar.xz
ARG BLENDER_SHA256=dacb8264197a3f7fda6001285a5a506fc97ee943881261c2c3bd63c882f22e05
RUN curl -fsSL -o /tmp/b.tar.xz "$BLENDER_URL" \
  && echo "$BLENDER_SHA256  /tmp/b.tar.xz" | sha256sum -c - \
  && mkdir -p /opt/blender && tar -xJf /tmp/b.tar.xz -C /opt/blender --strip-components=1 \
  && rm /tmp/b.tar.xz && ln -s /opt/blender/blender /usr/local/bin/blender-bin

# The user (name, uid, gid, HOME) is created at container start by entrypoint.sh from HOST_* variables, so the same
# image works for any host user and every path inside the container equals the path on the host.
RUN (userdel -r ubuntu 2>/dev/null || true) && (groupdel ubuntu 2>/dev/null || true) \
  && mkdir -p /data /var/log/reel-hub

COPY blender-run /usr/local/bin/blender-run
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY voicestudio-run /usr/local/bin/voicestudio-run
COPY supervisord.conf /etc/supervisor/supervisord.conf
COPY placeholder.mjs /opt/placeholder.mjs
RUN chmod +x /usr/local/bin/blender-run /usr/local/bin/entrypoint.sh /usr/local/bin/voicestudio-run \
  && ln -sf /usr/local/bin/blender-run /usr/local/bin/blender

# Defaults only: docker-compose.yml passes the real values (see .env.example).
ENV HOST_USER=reel HOST_UID=1000 HOST_GID=1000 HOST_HOME=/home/reel REEL_ROOT=/home/reel/reel-studio \
    HOME=/home/reel DISPLAY=:99 BLENDER_DEVICE=cpu VOICE_DEVICE=gpu \
    VOICESTUDIO_REPO=https://github.com/debpalash/VoiceStudio.git VOICESTUDIO_REF=v0.5.8
# /workspace is a symlink to the project, re-pointed at start by entrypoint.sh, so `docker exec` lands in the project.
RUN mkdir -p /home/reel/reel-studio && ln -s /home/reel/reel-studio /workspace
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["supervisord","-n","-c","/etc/supervisor/supervisord.conf"]
