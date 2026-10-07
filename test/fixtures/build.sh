#!/bin/sh

set -eu

: "${WASI_SDK_PATH:?WASI_SDK_PATH must point at a wasi-sdk installation}"

cd "$(dirname "$0")"

for source in *.c; do
  "$WASI_SDK_PATH/bin/clang" \
    --target=wasm32-wasip1 \
    --sysroot="$WASI_SDK_PATH/share/wasi-sysroot" \
    -O2 \
    -Wl,--strip-all \
    "$source" \
    -o "${source%.c}.wasm"
done
