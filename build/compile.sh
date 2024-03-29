#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

usage() {
    cat <<EOF
Usage: $(basename "$0") [-d]

Runs the build, processing src/ to create dist/.

Options (last wins):

-d|--dev:  Development mode (default is production)
-p|--prod: Production mode

EOF
    exit 0
}

mode=build
while [ $# -gt 0 ] ; do
    case "${1:-}" in
        -d|--dev) mode=dev ;;
        -p|--prod) mode=build ;;
        -h|--help) usage ;;
        --) shift ; break ;;
        *) echo "Unrecognized argument: ${1:-}" >&2 ;;
    esac
    shift
done

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
# cp lines: our files / favicon / destination
cp -a ./*.html ./*.css images pickr \
     ./*.png favicon.ico safari-pinned-tab.svg \
    ../dist
cd ..
if [ ! -d node_modules ] || [ -n "$(find package.json -newer build/.install 2>&1)" ] ; then
    yarn install --frozen-lockfile
    touch build/.install
fi
yarn run "${mode}"
