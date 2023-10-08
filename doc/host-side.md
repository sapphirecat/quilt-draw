# Host-side mode, macOS/Linux

This documentation is part of the [Quilt Draw](../) project.

## Initial setup

1. Get [Yarn 1.x](https://classic.yarnpkg.com/) if you need it; `npm i -g yarn`

## Manual rebuild

1. Change to the repository directory
2. `./build/compile.sh -d` to do an initial build of the project:
   the `-d` is for development mode

_NOTE:_ When run without options, `./build/compile.sh` will create a
release (aka minified) version.

## Ongoing development option

* `yarn run dev-server`
* Open [localhost:8080](http://localhost:8080/) in your browser

This will only automatically pick up changes to `src/app.ts`.  Other changes
need copied over (from `src` to `dist`) manually.

## Serving the files

Assuming you are still in the repository directory,
one of the following may work to serve the `dist` directory
at an address of [localhost:9001](http://localhost:9001/):

* `python3 -m http.server -d dist 9001`
* `php -t dist -S localhost:9001`
* `ruby -run -e httpd dist -p 9001`

(Why 9001? _[It’s over 9000!](https://en.wikipedia.org/wiki/It%27s_Over_9000!)_)
