# Container mode, podman/Docker

This documentation is part of the [Quilt Draw](../) project.

Due to licensing concerns, these directions will feature the `podman`
command, but changing “podman” to “docker” is expected to be compatible
if the Docker engine is in use.

## Manual (re)build

1. Change to the repository directory
2. `podman build -t quilt-draw:latest -f build/Containerfile .` _or_
   on macOS/Linux, `./build/container.sh`

This (always) builds **an image** tagged `quilt-draw:latest`.
It does not start a container; that is discussed below.

## Running the container

* `podman run -it -p 9001:9001 quilt-draw:latest`
* Navigate to [localhost:9001](http://localhost:9001/)

The container always listens on port 9001.  To use a different port,
for example 8080, change the left side of the port-binding value:

    podman run --rm -it -p 8080:9001 quilt-draw:latest

Use Ctrl+C to stop the container.
