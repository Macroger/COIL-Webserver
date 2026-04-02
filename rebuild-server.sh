#!/usr/bin/env bash
rm -rf ./build/
cmake -B build -S .
cmake --build build