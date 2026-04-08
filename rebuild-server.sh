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

echo "Interpreter: $0"
ps -p $$ -o comm=


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
	if ! rm -rf ./build/ 2>/dev/null; then
		echo "Permission denied removing build/ — fixing ownership with sudo..."
		sudo chown -R "$(id -u):$(id -g)" ./build/
		rm -rf ./build/
	fi
else
	echo "Performing incremental build (preserves build/). Use --full to force clean rebuild."
fi

# Ensure external dependencies are present; install them if any are missing.
MISSING_DEPS=0
[[ ! -d external/asio ]]   && MISSING_DEPS=1
[[ ! -d external/crow ]]   && MISSING_DEPS=1
[[ ! -d external/httplib ]] && MISSING_DEPS=1

if [[ $MISSING_DEPS -eq 1 ]]; then
	echo "One or more dependencies missing in external/ — running install_deps.sh..."
	bash install_scripts/install_deps.sh --no-boost
fi

# Configure the project into the build directory
cmake -B build -S .

# Determine parallelism: use JOBS env if set, otherwise use available CPUs
: ${JOBS:=$(nproc)}

# Build using CMake; pass -j to the underlying build tool to speed compilation
cmake --build build -- -j${JOBS}