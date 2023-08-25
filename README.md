# ![Quilt Draw](src/logo.svg "Quilt Draw")

Quarter-square triangle design assistant

# Releases

## Stable

**[https://sapphirecat.github.io/quilt-draw/](https://sapphirecat.github.io/quilt-draw/)**

## Development

Initial setup:

1. Clone the repo
2. `yarn install --frozen-lockfile` to download everything
   (get [Yarn 1.x](https://classic.yarnpkg.com/) if you need it)
3. `./build.sh -d` to do an initial build of the project:
   the `-d` for development mode

NOTE: When run without options, `./build.sh` will create a release/minified
version.

Ongoing development:

* `yarn run dev-server`
* Open [localhost:8080](http://localhost:8080/) in your browser

This will only automatically pick up changes to `src/app.ts`.  Other changes
need copied over manually.

# License

[GNU Affero General Public License v3.0 or later](https://spdx.org/licenses/AGPL-3.0-or-later.html#licenseText)
