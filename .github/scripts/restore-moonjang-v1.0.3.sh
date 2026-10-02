#!/usr/bin/env bash
set -euo pipefail

bash .github/scripts/restore-moonjang-standalone.sh

python3 - <<'PY'
import base64, pathlib
src = pathlib.Path('.github/pending/moonjang-v1.0.3.patch.gz.b64')
out = pathlib.Path('/tmp/moonjang-v1.0.3.patch.gz')
out.write_bytes(base64.b64decode(src.read_text().strip()))
PY

gzip -dc /tmp/moonjang-v1.0.3.patch.gz > /tmp/moonjang-v1.0.3.patch
(
  cd moonjang-production
  patch -p1 < /tmp/moonjang-v1.0.3.patch
  test "$(node -p "require('./package.json').version")" = "1.0.3"
  grep -q '"version": "1.0.3"' src-tauri/tauri.conf.json
  grep -q 'moveCollectionItem' src/shared/api.ts
  grep -q '서랍 삭제' src/App.tsx
  grep -q 'btn-danger' src/styles.css
  grep -q '360px mobile layout' e2e/standalone.spec.ts
)
