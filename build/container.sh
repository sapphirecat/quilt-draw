#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
cmd=podman
if ! command -v podman >/dev/null 2>&1 ; then
    cmd=docker
fi

exec "${cmd}" build -t quilt-draw:latest -f build/Containerfile .
