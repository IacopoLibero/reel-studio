#!/bin/sh
# Puts four pictures in one 2 x 2 grid (to look at them together).  scripts/carousel/grid.sh <out.png> <a.png> <b.png> <c.png> <d.png>
set -e
out="$1"; shift
[ "$#" -eq 4 ] || { echo "usage: grid.sh <out.png> <a> <b> <c> <d>" >&2; exit 2; }
ffmpeg -v error -y -i "$1" -i "$2" -i "$3" -i "$4" -filter_complex "[0:v][1:v]hstack[t];[2:v][3:v]hstack[b];[t][b]vstack" -frames:v 1 "$out"
