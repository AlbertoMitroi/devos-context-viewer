#!/usr/bin/env bash
# Pulls the public lab generations from GHCR with ORAS (in Docker) into <out>/<repository>-<engine>/,
# checks each layer against its dev.devos.intelligence.manifest-sha256 annotation and drops index.sqlite
# (the viewer reads graph/*.ndjson, never the index). Layout: the engines' docs/USAGE.md "Publishing the generation (OCI)".
# Usage: scripts/pull-lab-generations.sh <out> [owner]
set -euo pipefail

OUT=${1:?usage: pull-lab-generations.sh <out> [owner]}
OWNER=${2:-albertomitroi}
ORAS=ghcr.io/oras-project/oras:v1.3.6@sha256:9cfb578be975b762fd898b9d004243d8003aeb807a3e15b2ed212cdd1326c9eb
GENERATIONS="devos-lab-core:dotnet devos-lab-pricing:dotnet devos-lab-intake:dotnet devos-lab-leasing:dotnet devos-lab-web:angular"

mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

for entry in $GENERATIONS; do
  repo=${entry%%:*}
  engine=${entry##*:}
  ref="ghcr.io/$OWNER/context-$repo:main-$engine"
  oci="$WORK/$repo-$engine"
  dest="$OUT/$repo-$engine"
  mkdir -p "$oci"
  docker run --rm --user "$(id -u):$(id -g)" -v "$oci:/work" -w /work "$ORAS" manifest fetch "$ref" > "$oci.manifest.json"
  docker run --rm --user "$(id -u):$(id -g)" -v "$oci:/work" -w /work "$ORAS" pull "$ref" > "$oci.log"
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
  rm -f "$dest/index.sqlite"
  echo "$ref $(grep '^Digest:' "$oci.log" | cut -d ' ' -f 2) commit $(jq -r .commit "$dest/manifest.json") ok"
done
