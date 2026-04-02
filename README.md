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

## Building
1. Create and enter the build directory:
    - `mkdir build`
    - `cd build`
2. Generate build files:
    - `cmake ..`
3. Build the project:
    - `cmake --build .`
4. The executable (`COIL_WEBSERVER` or `COIL_WEBSERVER.exe`) will be in the project root.

## Running
- On Linux: `./COIL_WEBSERVER`
- On Windows: `COIL_WEBSERVER.exe`
- Or use `run-server.sh` (Linux only)

## Requirements
- C++20 compatible compiler (GCC, Clang, MSVC)
- CMake 3.20+
- Boost (system, filesystem)
- Threads library

## License
This project is provided under the MIT License. See LICENSE for details.

## Credits
- [Crow](https://github.com/CrowCpp/crow)
- [ASIO](https://think-async.com/)
