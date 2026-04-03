#!/usr/bin/env bash
# Rebuild the project from a clean build directory.
#
# Usage:
#   ./rebuild-server.sh            # incremental build (fast)
#   ./rebuild-server.sh --full     # full rebuild: remove build/ then configure+build
#   JOBS=4 ./rebuild-server.sh     # override parallel job count for build step
#
# What it does:
# - removes the existing `build/` directory
# - re-runs CMake configure into `build/`
# - builds using parallel jobs (defaults to number of CPU cores)


set -euo pipefail

# Parse flags --full to force a clean rebuild. Default behavior is incremental build.
FULL=0
while [[ $# -gt 0 ]]; do
	case "$1" in
		--full|-f)
			FULL=1; shift ;;
		-h|--help)
			sed -n '1,40p' "$0"; exit 0 ;;
		*)
			echo "Unknown argument: $1" >&2; exit 2 ;;
	esac
done

if [[ $FULL -eq 1 ]]; then
	echo "Performing full rebuild: removing build/"
	rm -rf ./build/
else
	echo "Performing incremental build (preserves build/). Use --full to force clean rebuild."
fi

# Configure the project into the build directory
cmake -B build -S .

# Determine parallelism: use JOBS env if set, otherwise use available CPUs
: ${JOBS:=$(nproc)}

# Build using CMake; pass -j to the underlying build tool to speed compilation
cmake --build build -- -j${JOBS}