#!/usr/bin/env sh
set -eu

mkdir -p bin
cc native/hash256_opencl.c -O3 -o bin/hash256-opencl -lOpenCL
echo "Built bin/hash256-opencl"
