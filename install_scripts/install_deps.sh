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


# Ensure git is installed (required for CMake FetchContent / ExternalProject)
###############################################################################
if ! command -v git >/dev/null 2>&1; then
  echo "git not found — attempting to install"

  if command -v apt-get >/dev/null 2>&1 && [[ $(id -u) -eq 0 ]]; then
    apt-get update
    apt-get install -y --no-install-recommends git
  elif command -v apk >/dev/null 2>&1 && [[ $(id -u) -eq 0 ]]; then
    apk add --no-cache git
  else
    echo "ERROR: git is required but could not be installed automatically."
    echo "Please install git manually and re-run this script." >&2
    exit 10
  fi
fi


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
    echo "Boost already present under external/boost, skipping download/build."
  else
    # First try to use the system package manager on Debian/Ubuntu to install boost dev packages
    SKIP_BOOST_BUILD=0
    APT_SUDO=""
    if have_cmd apt-get; then
      if [[ $(id -u) -ne 0 ]] && have_cmd sudo; then
        APT_SUDO="sudo"
      fi
      if [[ $(id -u) -eq 0 ]] || have_cmd sudo; then
        echo "Installing boost dev packages via apt"
        $APT_SUDO apt-get update -qq
        $APT_SUDO apt-get install -y --no-install-recommends libboost-system-dev libboost-filesystem-dev || true
        # If install succeeded, prefer system boost (CMake will find it)
        if ldconfig -p | grep -q libboost_system; then
          echo "System Boost libraries available; skipping local Boost build."
          SKIP_BOOST_BUILD=1
        else
          echo "System Boost installation did not make libraries available; falling back to local build."
        fi
      fi
    fi

    if [[ $SKIP_BOOST_BUILD -eq 0 ]]; then
      # Download boost source tarball (fallback)
      # Try multiple URLs: archives.boost.io (official), then GitHub releases (dashes in asset name)
      BOOST_DIRNAME=boost_$(echo "$BOOST_VERSION" | tr . _)
      BOOST_TMPDIR=$(mktemp -d)
      trap 'rm -rf "$BOOST_TMPDIR"' RETURN
      BOOST_URLS=(
        "https://archives.boost.io/release/${BOOST_VERSION}/source/${BOOST_DIRNAME}.tar.gz"
        "https://github.com/boostorg/boost/releases/download/boost-${BOOST_VERSION}/boost-${BOOST_VERSION}.tar.gz"
      )
      BOOST_DOWNLOADED=0
      for BOOST_URL in "${BOOST_URLS[@]}"; do
        echo "Trying to download Boost $BOOST_VERSION from $BOOST_URL"
        if have_cmd curl; then
          curl -fsSL -o "$BOOST_TMPDIR/boost.tar.gz" "$BOOST_URL" 2>/dev/null && BOOST_DOWNLOADED=1 || true
        else
          wget -qO "$BOOST_TMPDIR/boost.tar.gz" "$BOOST_URL" 2>/dev/null && BOOST_DOWNLOADED=1 || true
        fi
        if tar -tzf "$BOOST_TMPDIR/boost.tar.gz" >/dev/null 2>&1; then
          echo "Download succeeded from $BOOST_URL"
          break
        fi
        echo "That URL did not return a valid archive, trying next..."
        BOOST_DOWNLOADED=0
      done

      if [[ $BOOST_DOWNLOADED -eq 0 ]]; then
        echo "ERROR: Could not download a valid Boost $BOOST_VERSION archive from any known URL." >&2
        echo "Install Boost manually (e.g. sudo apt-get install libboost-dev) and re-run." >&2
        exit 6
      fi

      # Detect extracted top-level directory (handles both underscore and dash naming)
      echo "Extracting Boost"
      tar -xzf "$BOOST_TMPDIR/boost.tar.gz" -C "$BOOST_TMPDIR"
      SRC=$(find "$BOOST_TMPDIR" -maxdepth 1 -mindepth 1 -type d -print -quit)
      if [[ -z "$SRC" || ! -f "$SRC/bootstrap.sh" ]]; then
        echo "ERROR: Failed to find Boost source tree after extraction." >&2; exit 7
      fi

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


###############################################################################
# cpp-httplib (header-only)
###############################################################################
echo "==> Ensuring cpp-httplib in external/httplib"

if [[ -d external/httplib && -f external/httplib/include/httplib.h ]]; then
  echo "cpp-httplib already present under external/httplib/include, skipping clone/download."
else
  mkdir -p external/httplib/include
  if have_cmd git; then
    echo "Cloning cpp-httplib (shallow) into temp dir"
    HTTPLIB_TMPDIR=$(mktemp -d)
    trap 'rm -rf "$HTTPLIB_TMPDIR"' RETURN
    git clone --depth 1 https://github.com/yhirose/cpp-httplib.git "$HTTPLIB_TMPDIR/cpp-httplib"
    if [[ -f "$HTTPLIB_TMPDIR/cpp-httplib/httplib.h" ]]; then
      cp "$HTTPLIB_TMPDIR/cpp-httplib/httplib.h" external/httplib/include/
      echo "Copied httplib.h to external/httplib/include/"
    else
      echo "ERROR: httplib.h not found in cloned repo — aborting." >&2; exit 8
    fi
    echo "Done installing cpp-httplib."
  else
    echo "git not available — attempting to download release tarball"
    HTTPLIB_TMPDIR=$(mktemp -d)
    trap 'rm -rf "$HTTPLIB_TMPDIR"' RETURN
    HTTPLIB_URL="https://github.com/yhirose/cpp-httplib/archive/refs/heads/master.tar.gz"
    echo "Downloading $HTTPLIB_URL"
    if have_cmd curl; then
      curl -fsSL -o "$HTTPLIB_TMPDIR/httplib.tar.gz" "$HTTPLIB_URL"
    else
      wget -qO "$HTTPLIB_TMPDIR/httplib.tar.gz" "$HTTPLIB_URL"
    fi
    tar -xzf "$HTTPLIB_TMPDIR/httplib.tar.gz" -C "$HTTPLIB_TMPDIR"
    # Locate httplib.h anywhere in the extracted archive (works regardless of branch/tag name)
    HTTPLIB_H=$(find "$HTTPLIB_TMPDIR" -name "httplib.h" -print -quit)
    if [[ -z "$HTTPLIB_H" ]]; then
      echo "ERROR: Failed to locate httplib.h in downloaded archive." >&2; exit 8
    fi
    cp "$HTTPLIB_H" external/httplib/include/
    echo "Copied httplib.h to external/httplib/include/"
  fi
fi

# Final verification
if [[ ! -f external/httplib/include/httplib.h ]]; then
  echo "ERROR: cpp-httplib installation failed — external/httplib/include/httplib.h not found." >&2
  exit 8
fi
echo "cpp-httplib ready (external/httplib/include)."

###############################################################################
# CMake (minimum 3.20 required by CMakeLists.txt)
###############################################################################
CMAKE_MIN_MAJOR=3
CMAKE_MIN_MINOR=20

echo "==> Checking CMake version (need >= ${CMAKE_MIN_MAJOR}.${CMAKE_MIN_MINOR})"

cmake_meets_min() {
  if ! have_cmd cmake; then return 1; fi
  local ver
  ver=$(cmake --version 2>/dev/null | head -1 | grep -oP '\d+\.\d+\.\d+' | head -1)
  [[ -z "$ver" ]] && return 1
  local maj min
  maj=$(echo "$ver" | cut -d. -f1)
  min=$(echo "$ver" | cut -d. -f2)
  [[ "$maj" -gt "$CMAKE_MIN_MAJOR" || ( "$maj" -eq "$CMAKE_MIN_MAJOR" && "$min" -ge "$CMAKE_MIN_MINOR" ) ]]
}

if cmake_meets_min; then
  echo "CMake $(cmake --version | head -1 | grep -oP '\d+\.\d+\.\d+') is sufficient, skipping install."
else
  echo "CMake not found or below ${CMAKE_MIN_MAJOR}.${CMAKE_MIN_MINOR} — attempting to install"
  INSTALLED=0

  # Prefer apt (Debian/Ubuntu) — use Kitware's apt repo for a recent version
  if have_cmd apt-get && [[ $(id -u) -eq 0 ]]; then
    apt-get update
    apt-get install -y --no-install-recommends cmake || true
    if cmake_meets_min; then
      echo "CMake installed via apt."
      INSTALLED=1
    else
      echo "apt cmake is too old; falling back to Kitware's official installer."
    fi
  fi

  # Fallback: Kitware's official cmake-install script (works on Linux x86_64/aarch64)
  if [[ $INSTALLED -eq 0 ]]; then
    ARCH=$(uname -m)
    CMAKE_INSTALL_VER="3.29.6"
    case "$ARCH" in
      x86_64)  CMAKE_SCRIPT="cmake-${CMAKE_INSTALL_VER}-linux-x86_64.sh" ;;
      aarch64) CMAKE_SCRIPT="cmake-${CMAKE_INSTALL_VER}-linux-aarch64.sh" ;;
      *)
        echo "ERROR: Unsupported architecture '$ARCH'. Please install CMake ${CMAKE_MIN_MAJOR}.${CMAKE_MIN_MINOR}+ manually." >&2
        exit 11
        ;;
    esac
    CMAKE_URL="https://github.com/Kitware/CMake/releases/download/v${CMAKE_INSTALL_VER}/${CMAKE_SCRIPT}"
    TMPDIR=$(mktemp -d)
    trap 'rm -rf "$TMPDIR"' RETURN
    echo "Downloading CMake ${CMAKE_INSTALL_VER} from ${CMAKE_URL}"
    if have_cmd curl; then
      curl -L -o "$TMPDIR/$CMAKE_SCRIPT" "$CMAKE_URL"
    else
      wget -qO "$TMPDIR/$CMAKE_SCRIPT" "$CMAKE_URL"
    fi
    chmod +x "$TMPDIR/$CMAKE_SCRIPT"
    "$TMPDIR/$CMAKE_SCRIPT" --skip-license --prefix=/usr/local
    echo "CMake ${CMAKE_INSTALL_VER} installed to /usr/local."
    INSTALLED=1
  fi

  if ! cmake_meets_min; then
    echo "ERROR: CMake installation failed or version still below ${CMAKE_MIN_MAJOR}.${CMAKE_MIN_MINOR}." >&2
    echo "Please install CMake manually: https://cmake.org/download/" >&2
    exit 12
  fi
fi

echo "All requested dependencies are installed under external/"
echo "You can now run: cmake -S . -B build && cmake --build build -- -j$(nproc)"

exit 0
