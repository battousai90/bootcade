#!/usr/bin/env bash
# Prepare une capture pour la galerie : une image pleine taille et une
# vignette, toutes deux en WebP, dans gallery/shots/ et gallery/shots/thumb/.
# Affiche ensuite la ligne a coller dans gallery/shots.json.
#
#   tools/add-shot.sh ~/Pictures/Screenshots/capture.png game-library library
#
# Arguments : fichier source, nom de sortie (sans extension), etiquette
# (library, roms, controllers ou settings).
#
# Pourquoi WebP : une capture PNG de 1920x1080 pese 1 a 3 Mo, la meme en WebP
# qualite 86 en pese 150 a 300 Ko sans difference visible. La vignette (900 px
# de large) sert la grille ; la pleine taille n'est chargee qu'a l'ouverture.
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: $0 <capture> <nom> [etiquette]" >&2
  exit 1
fi

src=$1
name=$2
tag=${3:-library}
dir=$(cd "$(dirname "$0")/.." && pwd)/gallery/shots
mkdir -p "$dir/thumb"

# « > » : ne reduit que si l'image depasse, n'agrandit jamais.
magick "$src" -strip -resize '2560x2560>' -quality 86 "$dir/$name.webp"
magick "$src" -strip -resize '900x900>'   -quality 80 "$dir/thumb/$name.webp"

read -r w h < <(magick identify -format '%w %h' "$dir/$name.webp")
full=$(du -h "$dir/$name.webp" | cut -f1)
thumb=$(du -h "$dir/thumb/$name.webp" | cut -f1)

echo "gallery/shots/$name.webp ($full), vignette ($thumb)" >&2
echo "A ajouter dans gallery/shots.json :" >&2
printf '  { "file": "%s.webp", "w": %s, "h": %s, "tag": "%s",\n    "title": { "en": "", "fr": "" } }\n' \
  "$name" "$w" "$h" "$tag"
