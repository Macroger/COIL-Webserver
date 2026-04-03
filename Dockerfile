# Use Ubuntu 24.04 as the base image
FROM ubuntu:24.04

# Avoid prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install compiler, CMake, Git, and Boost dependencies
# Git is required to clone Crow and for CMake FetchContent (ASIO)
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    libboost-system-dev \
    libboost-filesystem-dev \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory in the container
WORKDIR /app

# Copy the project source into the container
COPY . .

# Crow is a header-only library expected at external/crow/include.
# It is gitignored so we clone it here before building.
# ASIO is fetched automatically by CMake FetchContent during configure.
RUN git clone --depth 1 https://github.com/CrowCpp/Crow.git external/crow

# Configure and build the project
# The binary is placed in /app/ by RUNTIME_OUTPUT_DIRECTORY in CMakeLists.txt
RUN cmake -B build -S . && \
    cmake --build build --parallel

# Expose the webserver port
EXPOSE 23500

# Run the server
CMD ["./COIL_WEBSERVER"]
