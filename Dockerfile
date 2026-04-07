
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

# Create a non-root user and group
RUN useradd -ms /bin/bash coiluser

# Set the working directory in the container
WORKDIR /app

# Copy the project source into the container
COPY . .

# Set ownership of /app to the non-root user
RUN chown -R coiluser:coiluser /app

# Switch to the non-root user
USER coiluser

# Clone all header-only / source dependencies into external/ before building.
# Crow and ASIO are gitignored; httplib is also cloned here for relay mode.
RUN git clone --depth 1 https://github.com/CrowCpp/Crow.git external/crow
RUN git clone --depth 1 https://github.com/chriskohlhoff/asio.git external/asio
RUN git clone --depth 1 https://github.com/yhirose/cpp-httplib.git external/httplib

# Configure and build the project
# The binary is placed in /app/ by RUNTIME_OUTPUT_DIRECTORY in CMakeLists.txt
RUN cmake -B build -S . && \
    cmake --build build --parallel

# Expose the webserver port
EXPOSE 30333

# Run the server
CMD ["./COIL_WEBSERVER"]
