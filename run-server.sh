#!/usr/bin/env bash
# Run the COIL_WEBSERVER executable from anywhere, using an absolute path.
# Adjust PROJECT_ROOT if your repo moves.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec "$PROJECT_ROOT/build/COIL_WEBSERVER" "$@"
