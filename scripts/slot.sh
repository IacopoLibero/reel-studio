#!/usr/bin/env bash
# Usage: scripts/slot.sh <name> <slots> -- <command...>
# Runs the command once one of <slots> lock files for <name> is free. Used to limit parallel
# GPU work (name=voice, slots=1) and parallel renders (name=render, slots=3) when many reels are built at once.
name="$1"; slots="$2"; shift 3
dir="${TMPDIR:-/tmp}/reel-slots"; mkdir -p "$dir"
while true; do
  for i in $(seq 1 "$slots"); do
    exec 9>"$dir/$name.$i.lock"
    if flock -n 9; then "$@"; exit $?; fi
    exec 9>&-
  done
  sleep 2
done
