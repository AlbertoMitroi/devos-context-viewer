#!/usr/bin/env bash
# Pulls the public lab generations from GHCR with ORAS (in Docker) into <out>/<name>/: the five repositories
# (ghcr.io/<owner>/context-devos-lab-*:main-<engine>, into <repository>-<engine>/) and the lab system generation
# combined by intelligence-federation (ghcr.io/<owner>/context-systems:lab-main, into devos-lab/). Each layer is
# checked against its dev.devos.intelligence.manifest-sha256 annotation, and index.sqlite is dropped (the viewer
# reads graph/*.ndjson, never the index). Layout: the engines' docs/USAGE.md "Publishing the generation (OCI)".
# Usage: scripts/pull-lab-generations.sh <out> [owner]
set -euo pipefail

OUT=${1:?usage: pull-lab-generations.sh <out> [owner]}
OWNER=${2:-albertomitroi}
ORAS=ghcr.io/oras-project/oras:v1.3.6@sha256:9cfb578be975b762fd898b9d004243d8003aeb807a3e15b2ed212cdd1326c9eb
GENERATIONS="devos-lab-core:dotnet devos-lab-pricing:dotnet devos-lab-intake:dotnet devos-lab-leasing:dotnet devos-lab-web:angular"
# <package>:<tag>=<folder>; the folder name is the generation id and the switcher label of a system.
SYSTEMS="context-systems:lab-main=devos-lab"

mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# pull <ref> <folder> [generation type the manifest must declare]
pull() {
  local ref=$1 name=$2 type=${3:-}
  local oci="$WORK/$name" dest="$OUT/$name"
  mkdir -p "$oci"
  docker run --rm --user "$(id -u):$(id -g)" -v "$oci:/work" -w /work "$ORAS" manifest fetch "$ref" > "$oci.manifest.json"
  docker run --rm --user "$(id -u):$(id -g)" -v "$oci:/work" -w /work "$ORAS" pull "$ref" > "$oci.log"
  local expected actual
  expected=$(jq -r '.layers[] | select(.annotations["org.opencontainers.image.title"] == "generation.tar.gz")
    | .annotations["dev.devos.intelligence.manifest-sha256"]' "$oci.manifest.json")
  rm -rf "$dest" && mkdir -p "$dest"
  tar -xzf "$oci/generation.tar.gz" -C "$dest"
  actual=$(sha256sum "$dest/manifest.json" 2>/dev/null || shasum -a 256 "$dest/manifest.json")
  actual=${actual%% *}
  if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
    echo "$ref: manifest.json sha256 $actual does not match the layer annotation '$expected'" >&2
    exit 1
  fi
  if [ -n "$type" ] && [ "$(jq -r '.generationType // empty' "$dest/manifest.json")" != "$type" ]; then
    echo "$ref: manifest.json is not a $type generation" >&2
    exit 1
  fi
  rm -f "$dest/index.sqlite"
  echo "$ref $(grep '^Digest:' "$oci.log" | cut -d ' ' -f 2) commit $(jq -r .commit "$dest/manifest.json") ok"
}

for entry in $GENERATIONS; do
  repo=${entry%%:*}
  engine=${entry##*:}
  pull "ghcr.io/$OWNER/context-$repo:main-$engine" "$repo-$engine"
done
for entry in $SYSTEMS; do
  pull "ghcr.io/$OWNER/${entry%%=*}" "${entry##*=}" system
done
