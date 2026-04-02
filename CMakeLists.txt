# ------------------------------------------------------------------------------
# COIL Webserver - Single repo, modular targets (core + webserver)
# ------------------------------------------------------------------------------

cmake_minimum_required(VERSION 3.20)

project(COIL_WEBSERVER LANGUAGES CXX)

# --------------------------
# C++ standard
# --------------------------
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(THREADS_PREFER_PTHREAD_FLAG ON)

# --------------------------
# Dependencies
# --------------------------
find_package(Boost REQUIRED COMPONENTS system filesystem)
find_package(Threads REQUIRED)

include(FetchContent)

# --------------------------
# Core library (PktDef + MySocket)
# --------------------------
add_library(coil_core
  core/src/MySocket.cpp
  core/src/pktdef.cpp
  core/src/RobotTelemetry.cpp
)

target_include_directories(coil_core
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_features(coil_core PUBLIC cxx_std_20)

# Core does NOT depend on Crow or ASIO (by design)

# --------------------------
# Webserver executable
# --------------------------
add_executable(COIL_WEBSERVER
  src/main.cpp
)

set_target_properties(COIL_WEBSERVER PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/../"
)

# --------------------------
# Compiler warnings
# --------------------------
if (MSVC)
  target_compile_options(COIL_WEBSERVER PRIVATE /W4 /permissive-)
else()
  # target_compile_options(COIL_WEBSERVER PRIVATE -Wall -Wextra -Wpedantic)
endif()

# --------------------------
# Crow
# --------------------------
target_include_directories(
  COIL_WEBSERVER
  SYSTEM PRIVATE
    external/crow/include
)

# --------------------------
# ASIO (used by Crow / webserver only)
# --------------------------
FetchContent_Declare(
  asio
  GIT_REPOSITORY https://github.com/chriskohlhoff/asio.git
  GIT_TAG        master
)

FetchContent_Populate(asio)

target_include_directories(
  COIL_WEBSERVER
  PRIVATE
    ${asio_SOURCE_DIR}/asio/include
)

target_compile_definitions(
  COIL_WEBSERVER
  PRIVATE
    ASIO_STANDALONE=1
)

# --------------------------
# Linking
# --------------------------
target_link_libraries(
  COIL_WEBSERVER
  PRIVATE
    coil_core
    Boost::system
    Boost::filesystem
    Threads::Threads
)

# --------------------------
# Project include directory (webserver-specific headers)
# --------------------------
target_include_directories(
  COIL_WEBSERVER
  PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

# --------------------------
# Per-configuration defines
# --------------------------
target_compile_definitions(
  COIL_WEBSERVER
  PRIVATE
    $<$<CONFIG:Debug>:DEBUG>
    $<$<CONFIG:Release>:NDEBUG>
)
