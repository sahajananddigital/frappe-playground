#!/bin/bash
set -euo pipefail

echo "Preparing Cloudflare Pages publish directory..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
STORAGE_DIR="${PROJECT_ROOT}/storage"
PUBLIC_DIR="${PROJECT_ROOT}/public"

rm -rf "${PUBLIC_DIR}/storage" "${PUBLIC_DIR}/assets"
mkdir -p "${PUBLIC_DIR}/storage"

# Runtime files are fetched by the Web Worker from /storage, excluding assets.
find "${STORAGE_DIR}" -mindepth 1 -maxdepth 1 ! -name assets -exec cp -R {} "${PUBLIC_DIR}/storage/" \;

# Runtime and Frappe-rendered pages reference browser assets from /assets.
cp -R "${STORAGE_DIR}/assets" "${PUBLIC_DIR}/assets"
