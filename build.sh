#!/bin/sh
set -eu

cd "$(dirname "$0")"

# make sure we are probably in a reasonable place
if [ ! -d src ] ; then
    echo "src: not a directory" >&2
    exit 1
fi

# clear dist dir, safely
if [ -d dist ] ; then
    rm -rf dist
elif [ -e dist ] ; then
    echo "dist: not a directory" >&2
    exit 1
fi

mkdir dist
cd src
cp -a ./*.html ./*.css pickr ./*.svg ../dist
yarn run build
