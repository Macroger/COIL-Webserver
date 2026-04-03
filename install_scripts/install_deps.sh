#!/usr/bin/env bash
set -euo pipefail

# scripts/install_deps.sh
# Download and install project dependencies into the repository `external/` directory so
# CMake can find them without fetching from the network each configure.
#
# By default this script will install:
#  - Asio (git clone to external/asio)
#  - Crow (git clone to external/crow)
#  - Boost (download + build + install to external/boost) -- configurable and optional
#
# Usage:
#  ./scripts/install_deps.sh [--no-boost] [--no-asio] [--no-crow] [--boost-version X.Y.Z]

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT_DIR"

NO_BOOST=0
NO_ASIO=0
NO_CROW=0
BOOST_VERSION="1.82.0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-boost) NO_BOOST=1; shift ;;
    --no-asio) NO_ASIO=1; shift ;;
    --no-crow) NO_CROW=1; shift ;;
    --boost-version) BOOST_VERSION="$2"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--no-boost] [--no-asio] [--no-crow] [--boost-version X.Y.Z]"; exit 0 ;;
    *) echo "Unknown arg: $1"; exit 2;;
  esac
done

mkdir -p external

function have_cmd() { command -v "$1" >/dev/null 2>&1; }

###############################################################################
# Asio
###############################################################################
if [[ "$NO_ASIO" -eq 0 ]]; then
  echo "==> Ensuring Asio in external/asio"
  if [[ -d external/asio && ( -d external/asio/include || -d external/asio/asio/include ) ]]; then
    echo "Asio already present under external/asio, skipping clone/download."
  else
    if have_cmd git; then
      echo "Cloning Asio (shallow) into external/asio"
      rm -rf external/asio
      git clone --depth 1 https://github.com/chriskohlhoff/asio.git external/asio
      echo "Done cloning Asio."
    else
      echo "git not available — attempting to download release tarball"
      TMPDIR=$(mktemp -d)
      trap 'rm -rf "$TMPDIR"' RETURN
      ASIO_URL="https://github.com/chriskohlhoff/asio/archive/refs/heads/master.tar.gz"
      echo "Downloading $ASIO_URL"
      wget -qO "$TMPDIR/asio.tar.gz" "$ASIO_URL"
      mkdir -p external/asio
      tar -xzf "$TMPDIR/asio.tar.gz" -C "$TMPDIR"
      # copy out the asio tree (safe copy)
      SRC=$(find "$TMPDIR" -maxdepth 2 -type d -name asio -print -quit)
      if [[ -z "$SRC" ]]; then echo "Failed to locate asio in downloaded archive"; exit 4; fi
      mkdir -p external/asio
      cp -r "$SRC" external/asio/
    fi
  fi
  echo "Asio ready. CMake will accept either external/asio/include or external/asio/asio/include."
fi

###############################################################################
# Crow
###############################################################################
if [[ "$NO_CROW" -eq 0 ]]; then
  echo "==> Ensuring Crow in external/crow"
  if [[ -d external/crow && -d external/crow/include ]]; then
    echo "Crow already present under external/crow, skipping clone/download."
  else
    if have_cmd git; then
      echo "Cloning Crow (shallow) into external/crow"
      rm -rf external/crow
      git clone --depth 1 https://github.com/ipkn/crow.git external/crow
      echo "Done cloning Crow."
    else
      echo "git not available — attempting to download release tarball"
      TMPDIR=$(mktemp -d)
      trap 'rm -rf "$TMPDIR"' RETURN
      CROW_URL="https://github.com/ipkn/crow/archive/refs/heads/master.tar.gz"
      echo "Downloading $CROW_URL"
      wget -qO "$TMPDIR/crow.tar.gz" "$CROW_URL"
      mkdir -p external/crow
      tar -xzf "$TMPDIR/crow.tar.gz" -C "$TMPDIR"
      SRC=$(find "$TMPDIR" -maxdepth 2 -type d -name include -print -quit)
      if [[ -z "$SRC" ]]; then echo "Failed to locate include in downloaded crow archive"; exit 5; fi
      cp -r "$SRC" external/crow/
    fi
  fi
  echo "Crow ready (external/crow)."
fi

###############################################################################
# Boost (build + install into external/boost)
###############################################################################
if [[ "$NO_BOOST" -eq 0 ]]; then
  echo "==> Ensuring Boost (will build system/filesystem) into external/boost"
  if [[ -d external/boost && -d external/boost/include && -d external/boost/lib ]]; then
    echo "Boost appears installed under external/boost, skipping build."
  else
    # First try to use the system package manager on Debian/Ubuntu to install boost dev packages
    SKIP_BOOST_BUILD=0
    if have_cmd apt-get && [[ $(id -u) -eq 0 ]]; then
      echo "Detected apt-get and running as root — installing boost dev packages via apt"
      apt-get update
      apt-get install -y --no-install-recommends libboost-system-dev libboost-filesystem-dev || true
      # If install succeeded, prefer system boost (CMake will find it)
      if ldconfig -p | grep -q libboost_system; then
        echo "System Boost libraries appear available; skipping local Boost build."
        SKIP_BOOST_BUILD=1
      else
        echo "System Boost installation did not make libraries available; falling back to local build."
      fi
    fi

    if [[ $SKIP_BOOST_BUILD -eq 0 ]]; then
      # Download boost source tarball (fallback)
      BOOST_DIRNAME=boost_$(echo "$BOOST_VERSION" | tr . _)
      BOOST_TARBALL="$BOOST_DIRNAME".tar.gz
      # Prefer the official GitHub release URL for reliable downloads
      BOOST_URL="https://github.com/boostorg/boost/releases/download/boost-${BOOST_VERSION}/${BOOST_TARBALL}"
      TMPDIR=$(mktemp -d)
      trap 'rm -rf "$TMPDIR"' RETURN
      echo "Downloading Boost $BOOST_VERSION from $BOOST_URL"
      # use curl if available to follow redirects, otherwise wget
      if have_cmd curl; then
        curl -L -o "$TMPDIR/boost.tar.gz" "$BOOST_URL"
      else
        wget -qO "$TMPDIR/boost.tar.gz" "$BOOST_URL" || true
      fi

      # Validate the archive is a tar.gz
      if ! tar -tzf "$TMPDIR/boost.tar.gz" >/dev/null 2>&1; then
        echo "Downloaded file is not a valid tar.gz — aborting Boost local build."
        echo "You can install Boost via your package manager (apt/yum/apk) and re-run this script, or retry with a correct archive." >&2
        exit 6
      fi

      echo "Extracting Boost"
      tar -xzf "$TMPDIR/boost.tar.gz" -C "$TMPDIR"
      SRC="$TMPDIR/$BOOST_DIRNAME"
      if [[ ! -d "$SRC" ]]; then echo "Failed to extract Boost"; exit 7; fi

      pushd "$SRC" >/dev/null
      echo "Bootstrapping Boost (this may take a minute)"
      ./bootstrap.sh --prefix="$ROOT_DIR/external/boost" >/dev/null
      echo "Building and installing Boost (system + filesystem) — this can take several minutes"
      ./b2 install --with-system --with-filesystem -j"$(nproc)" --prefix="$ROOT_DIR/external/boost"
      popd >/dev/null

      echo "Boost installed into external/boost"
    fi
  fi
fi

echo "All requested dependencies are installed under external/"
echo "You can now run: cmake -S . -B build && cmake --build build -- -j$(nproc)"

exit 0
