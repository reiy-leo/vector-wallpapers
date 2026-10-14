#!/bin/bash
set -e
cd /workspace/work/wt-aurora-wave
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy
rm -rf /tmp/aw; node_modules/.bin/esbuild research/aw-render.ts --bundle --platform=node --format=esm --outfile=/tmp/aw-render.mjs --log-level=warning
node /tmp/aw-render.mjs /tmp/aw
python3 research/aw-shot.py /tmp/aw ${1:-/tmp/aw-sheet.png}
