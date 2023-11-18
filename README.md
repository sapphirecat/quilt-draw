<h1 id="logo"><picture>
    <source media="(prefers-color-scheme: dark)" type="image/svg+xml" srcset="src/images/logo-dk.svg">
    <source type="image/svg+xml" srcset="src/images/logo.svg">
    <img alt="Quilt Draw" src="src/images/logo.png">
</picture></h1>

Quarter-square triangle design assistant

# Repository Administrivia

The practice of PGP-signing commits to this repository will be reviewed during 2024.
The author will continue to sign commits until **at least**
2024-03-31
12:00:00 +0000.

# Releases

## Stable

**[https://sapphirecat.github.io/quilt-draw/](https://sapphirecat.github.io/quilt-draw/)**

This is the *recommended* option for using Quilt Draw.

Browsers supported:
[Firefox 52](https://archive.org/details/firefox-for-winXP-Vista)
([why?](https://sapphirecat.github.io/2023/236-quilt-draw-xp-vista/)),
[Pale Moon](https://www.palemoon.org/)
([why?](https://sapphirecat.github.io/2022/266-quilt-draw-pale-moon/)),
and mainstream modern browsers.

## Development

There are now two major options:

- **[Host-side mode](doc/host-side.md)** using [Node](https://nodejs.dev/),\*
  [Yarn](https://classic.yarnpkg.com/lang/en/),\*
  a POSIX shell (Linux/Mac/BSD), and a static HTTP server
- **[Container mode](doc/container.md)** using [Podman](https://podman.io),\*
  [Docker](https://www.docker.com/),\* or compatible

Host-side mode requires the development environment as a whole to be installed
on your computer, and is primarily focused on supporting Linux.
Container mode should work on any OS with Docker-compatible tools.

In addition, container mode **does not require** a separate HTTP server to view
the files in a Web browser, as the container provides this feature.

\* Links are provided for convenience, and DO NOT represent an endorsement
of the software or related web sites.

# Issue Tracker

Report problems or request features at
[GitHub Issues](https://github.com/sapphirecat/quilt-draw/issues/).

# License

[GNU Affero General Public License v3.0 or later](https://spdx.org/licenses/AGPL-3.0-or-later.html#licenseText)
