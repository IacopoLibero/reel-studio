#!/bin/sh
# Renders every slide of a carousel from its Remotion code: one still per slide, the composition gets {"n": <0-based index>}.
#   REEL_BRAND=<brand> scripts/carousel/render-slides.sh <code/index.ts> <CompositionId> <out folder> <slides>
# Writes <out folder>/slide-1.png ... slide-N.png. Run it through `bash scripts/slot.sh render 3 -- scripts/carousel/render-slides.sh ...` in a job.
set -e
entry="$1"; comp="$2"; out="$3"; n="$4"
[ -n "$entry" ] && [ -n "$comp" ] && [ -n "$out" ] && [ -n "$n" ] || { echo "usage: render-slides.sh <code/index.ts> <CompositionId> <out folder> <slides>" >&2; exit 2; }
mkdir -p "$out"
i=0
while [ "$i" -lt "$n" ]; do
  npx remotion still "$entry" "$comp" "$out/slide-$((i + 1)).png" --props="{\"n\":$i}"
  i=$((i + 1))
done
