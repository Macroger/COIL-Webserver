# COIL Webserver

A modular C++ webserver project for the COIL (Collaborative Online Integrated Learning) platform. This project is designed for cross-platform development, with a focus on Linux deployment, and leverages modern C++20, Crow (for HTTP), and ASIO (for networking).

## Features
- Modular architecture: core networking and packet handling separated from webserver logic
- Uses [Crow](https://github.com/CrowCpp/crow) for fast HTTP server functionality
- Uses [ASIO](https://think-async.com/) for asynchronous networking
- CMake-based build system
- Ready for deployment on Linux

## Project Structure
- `core/` — Core networking and packet handling logic
- `external/crow/` — Crow HTTP library (included as a submodule or external)
- `public/` — Static web assets (HTML, JS, CSS, images)
- `src/` — Main entry point and webserver logic
- `build/` — (Ignored) CMake build output
- `CMakeLists.txt` — Project build configuration
- `run-server.sh` — Linux shell script to run the server

## Docker (recommended)
The Dockerfile handles all dependencies automatically — no manual setup required.

```bash
docker build -t coil-webserver .
docker run -p 30333:30333 coil-webserver
```

The container clones Crow, ASIO, and cpp-httplib at build time, installs Boost via apt, then compiles and runs the server.

## Local Build

### Installing Dependencies
Before building locally for the first time, run the install script from the project root to fetch external libraries into `external/`:

```bash
./install_scripts/install_deps.sh
```

This clones Crow, ASIO, and cpp-httplib into `external/`, and installs Boost (via apt if running as root, or builds it locally as a fallback). Individual components can be skipped:

```bash
./install_scripts/install_deps.sh --no-boost      # skip Boost (if already installed system-wide)
./install_scripts/install_deps.sh --no-asio        # skip ASIO
./install_scripts/install_deps.sh --no-crow        # skip Crow
./install_scripts/install_deps.sh --boost-version 1.85.0  # specify a Boost version
```

### Building
Use the provided rebuild script from the project root:

```bash
./rebuild-server.sh            # incremental build (fast, preserves build/)
./rebuild-server.sh --full     # clean rebuild (removes build/ and reconfigures)
JOBS=4 ./rebuild-server.sh     # override parallel job count
```

The executable (`COIL_WEBSERVER`) will be placed in the project root after a successful build.

Alternatively, build manually:
1. `cmake -B build -S .`
2. `cmake --build build`

### Running
```bash
./COIL_WEBSERVER
```

### Requirements
- C++20 compatible compiler (GCC 11+ or Clang 14+ recommended)
- CMake 3.20+
- Boost (system, filesystem) — installed via `install_deps.sh` or system package manager
- Threads library

## License
This project is provided under the MIT License. See LICENSE for details.

## Credits
- [Crow](https://github.com/CrowCpp/crow)
- [ASIO](https://think-async.com/)
