#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WHEELS_DIR="${PROJECT_ROOT}/public/wheels"

# ─── Dependency Wheels ──────────────────────────────────────────────
mkdir -p "${WHEELS_DIR}"

download_wheel() {
    local url="$1"
    local filename="$(basename "$url")"
    if [ -f "${WHEELS_DIR}/${filename}" ]; then
        echo "  ✅ ${filename} already present"
    else
        echo "  📥 Downloading ${filename}..."
        curl -L -o "${WHEELS_DIR}/${filename}" "$url"
    fi
}

echo "📦 Downloading dependency wheels..."
download_wheel "https://files.pythonhosted.org/packages/source/d/docopt/docopt-0.6.2.tar.gz"
# docopt doesn't have a wheel on PyPI, use the one we built
# Actually download proper wheels
download_wheel "https://files.pythonhosted.org/packages/5c/71/dbfe5b4bfd26e98704a1b2cf5c1e89e6a09e2769ebdd2b7e6a5ca58498bc/docopt-0.6.2-py2.py3-none-any.whl"
download_wheel "https://files.pythonhosted.org/packages/a0/57/18c22978ab2a35c468a3b1e5e1ee3e1ae09f4cc7e5f0ee837ed9ce9a9aac/num2words-0.5.14-py3-none-any.whl"

echo ""
echo "✅ Bundle complete! Assets ready in public/"
