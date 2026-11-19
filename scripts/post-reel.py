#!/usr/bin/env python3
"""Legacy: the Reel Hub schedules reels in Instagram itself now. This publishes one finished reel to Instagram through Composio, at the time a systemd timer fires.

Usage: post-reel.py <reel folder name> <scheduled time, ISO with offset>
  e.g. post-reel.py 9-wrong-price-printed-menu 2026-11-20T16:30:00+01:00

Safe to run twice: a state file per reel stops a second publish. If the timer fires more than
LATE_LIMIT_S after the scheduled time (PC was off), nothing is published and a notification says so.
Posts the caption.md text as is, with a plain # (never %23), then reads the post back and compares.
"""
import json
import os
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

IG_USER_ID = os.environ.get("IG_USER_ID", "").strip()  # numeric Instagram user id, set in .env
ROOT = Path(__file__).resolve().parent.parent
REELS = ROOT / "reels" / os.environ.get("BRAND", "").strip()
STATE = Path.home() / ".local" / "state" / "reel-posts"
LATE_LIMIT_S = 2 * 3600
TRIES = 3


def notify(title: str, body: str) -> None:
    subprocess.run(["notify-send", "-u", "critical", title, body], check=False)


def log(name: str, msg: str) -> None:
    STATE.mkdir(parents=True, exist_ok=True)
    with open(STATE / f"{name}.log", "a") as f:
        f.write(f"{datetime.now().isoformat(timespec='seconds')} {msg}\n")


def composio(slug: str, args: dict) -> dict:
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, dir=STATE) as f:
        json.dump(args, f)
        path = f.name
    try:
        out = subprocess.run(["composio", "execute", slug, "-d", f"@{path}"], capture_output=True, text=True, timeout=900)
    finally:
        Path(path).unlink(missing_ok=True)
    try:
        data = json.loads(out.stdout)
    except json.JSONDecodeError:
        raise RuntimeError(f"{slug}: unreadable output: {out.stdout[-300:]} {out.stderr[-300:]}")
    if not data.get("successful", False):
        raise RuntimeError(f"{slug}: {json.dumps(data)[:400]}")
    return data


def find_id(node, key="id"):
    """First value under `key` anywhere in a nested response."""
    if isinstance(node, dict):
        if key in node and isinstance(node[key], (str, int)):
            return str(node[key])
        for v in node.values():
            r = find_id(v, key)
            if r:
                return r
    elif isinstance(node, list):
        for v in node:
            r = find_id(v, key)
            if r:
                return r
    return None


def publish(name: str) -> str:
    folder = REELS / name
    mp4 = next(folder.glob("*.mp4"))
    caption = (folder / "caption.md").read_text().strip()
    assert "%23" not in caption, "caption contains %23"
    created = composio("INSTAGRAM_POST_IG_USER_MEDIA", {
        "ig_user_id": IG_USER_ID, "media_type": "REELS", "share_to_feed": True,
        "video_file": str(mp4), "caption": caption,
    })
    container = find_id(created.get("data", created))
    if not container:
        raise RuntimeError(f"no container id in {json.dumps(created)[:300]}")
    log(name, f"container {container}")
    done = composio("INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH", {
        "ig_user_id": IG_USER_ID, "creation_id": container, "max_wait_seconds": 600,
    })
    media = find_id(done.get("data", done))
    if not media:
        raise RuntimeError(f"no media id in {json.dumps(done)[:300]}")
    log(name, f"published media {media}")
    (STATE / f"{name}.json").write_text(json.dumps({"media_id": media, "container": container}))
    check = composio("INSTAGRAM_GET_IG_MEDIA", {"ig_media_id": media, "fields": "id,caption,permalink"})
    live = (find_id(check.get("data", check), "caption") or "").strip()
    link = find_id(check.get("data", check), "permalink") or ""
    if live != caption:
        notify(f"Reel {name}: caption differs", f"Published but the live caption differs from caption.md. {link}")
        log(name, "CAPTION MISMATCH")
    else:
        log(name, f"caption verified {link}")
    return link


def main() -> int:
    if not IG_USER_ID or not os.environ.get("BRAND"):
        print("Set IG_USER_ID and BRAND in the environment (see .env.example) before using this legacy script.", file=sys.stderr)
        return 2
    name, when = sys.argv[1], datetime.fromisoformat(sys.argv[2])
    if (STATE / f"{name}.json").exists():
        log(name, "already published, skipping")
        return 0
    late = time.time() - when.timestamp()
    if late > LATE_LIMIT_S:
        notify(f"Reel {name} NOT published", f"The PC was off at {when:%a %d %b %H:%M}. Nothing was posted.")
        log(name, f"skipped, {late / 60:.0f} min late")
        return 1
    for attempt in range(1, TRIES + 1):
        try:
            link = publish(name)
            notify(f"Reel {name} published", link)
            return 0
        except Exception as e:  # noqa: BLE001 - report every failure, then retry
            log(name, f"attempt {attempt} failed: {e}")
            if (STATE / f"{name}.json").exists():
                notify(f"Reel {name}: check needed", f"Published, but a later step failed: {e}")
                return 1
            time.sleep(120 * attempt)
    notify(f"Reel {name} FAILED", f"{TRIES} attempts failed, see {STATE / (name + '.log')}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
