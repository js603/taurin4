#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PY'
import base64, gzip, glob, hashlib, pathlib
parts=sorted(glob.glob('.github/pending/moonjang-1.0.3.part*.b64'))
if not parts:
    raise SystemExit('missing 1.0.3 patch parts')
encoded=''.join(pathlib.Path(p).read_text() for p in parts)
raw=base64.b64decode(encoded)
actual=hashlib.sha256(raw).hexdigest()
expected='f34dd8fdbabc3ee2ec7da2db81db163bc3370fbbe88b852e9a8f7a94849f6c29'
if actual != expected:
    raise SystemExit(f'1.0.3 patch sha mismatch: {actual}')
pathlib.Path('/tmp/moonjang-1.0.3.patch').write_bytes(gzip.decompress(raw))
print('1.0.3 patch verified', actual)
PY

(
  cd moonjang-production
  patch -p0 < /tmp/moonjang-1.0.3.patch
  patch -p0 < ../.github/pending/moonjang-1.0.3-e2e-status-fix.patch
  patch -p0 < ../.github/pending/moonjang-1.0.3-refresh-fix.patch
)

grep -q 'localDeleteCollection' moonjang-production/src/shared/localDb.ts
grep -q 'moveCollectionItem' moonjang-production/src/shared/api.ts
grep -q 'onRefresh={refreshCore}' moonjang-production/src/App.tsx
grep -q '360px mobile layout' moonjang-production/e2e/standalone.spec.ts
