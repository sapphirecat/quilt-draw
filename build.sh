#!/bin/sh
set -eu

cd "$(dirname "$0")"

mode=build
case "${1:-.}" in
    -d) mode=dev ;;
esac

# make sure we are probably in a reasonable place
if [ ! -d src ] ; then
    echo "src: not a directory" >&2
    exit 1
fi

# clear dist dir, safely
if [ ! -e dist ] ; then
    mkdir dist
fi
if [ ! -d dist ] ; then
    echo "dist: not a directory" >&2
    exit 1
fi

cd src
cp -a ./*.html ./*.css images pickr ../dist
yarn run "${mode}"
