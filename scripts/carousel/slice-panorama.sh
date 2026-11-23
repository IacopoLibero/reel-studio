#!/bin/sh
# Cuts a wide render into one picture per slide with ffmpeg.
#   scripts/carousel/slice-panorama.sh <panorama.png> <out folder> <slides> [width=1080] [height=1350]
# Writes <out folder>/slice-1.png ... slice-N.png (the panorama must be N * width wide).
set -e
pano="$1"; out="$2"; n="$3"; w="${4:-1080}"; h="${5:-1350}"
[ -n "$pano" ] && [ -n "$out" ] && [ -n "$n" ] || { echo "usage: slice-panorama.sh <panorama.png> <out folder> <slides> [width] [height]" >&2; exit 2; }
mkdir -p "$out"
i=0
while [ "$i" -lt "$n" ]; do
  ffmpeg -v error -y -i "$pano" -vf "crop=$w:$h:$((i * w)):0" -frames:v 1 "$out/slice-$((i + 1)).png"
  i=$((i + 1))
done
echo "$n slices in $out"
