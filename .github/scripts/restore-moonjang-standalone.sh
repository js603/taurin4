#!/usr/bin/env bash
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN is required}"
REPO="${GITHUB_REPOSITORY:-js603/taurin4}"
TREE="$(cat .github/moonjang-source-tree.txt)"
STABLE_PATCH_COMMIT="b0afa33638b9b432bf2caa5e828574f322e9a2cb"

python3 - <<'PY'
import base64, json, os, pathlib, urllib.request
repo=os.environ.get('GITHUB_REPOSITORY','js603/taurin4')
tree=pathlib.Path('.github/moonjang-source-tree.txt').read_text().strip()
token=os.environ['GH_TOKEN']
h={'Authorization':f'Bearer {token}','Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}
def get(url):
    req=urllib.request.Request(url,headers=h)
    with urllib.request.urlopen(req) as f: return json.load(f)
data=get(f'https://api.github.com/repos/{repo}/git/trees/{tree}?recursive=1')
count=0
for item in data['tree']:
    if item['type']=='blob' and item['path'].startswith('moonjang-production/'):
        blob=get(item['url'])
        p=pathlib.Path(item['path'])
        p.parent.mkdir(parents=True,exist_ok=True)
        p.write_bytes(base64.b64decode(blob['content']))
        count+=1
if count < 20: raise SystemExit(f'incomplete source restore: {count}')
print('restored',count,'source files')
PY

mkdir -p moonjang-production/src moonjang-production/server moonjang-production/cloudflare/src
cat moonjang-production/ci-parts/app.*.part > moonjang-production/src/App.tsx
cat moonjang-production/ci-parts/styles.*.part > moonjang-production/src/styles.css
cat moonjang-production/ci-parts/localserver.*.part > moonjang-production/server/local_sqlite_server.py
cat moonjang-production/ci-parts/worker.*.part > moonjang-production/cloudflare/src/index.ts

curl -fsSL "https://raw.githubusercontent.com/${REPO}/${STABLE_PATCH_COMMIT}/.github/standalone-v2.patch.gz.b64" > /tmp/moonjang-standalone.patch.gz.b64
python3 - /tmp/moonjang-standalone.patch.gz.b64 /tmp/moonjang-standalone.patch.gz <<'PY'
import base64, pathlib, sys
src, dst = map(pathlib.Path, sys.argv[1:3])
dst.write_bytes(base64.b64decode(src.read_text()))
PY
gzip -dc /tmp/moonjang-standalone.patch.gz > /tmp/moonjang-standalone.patch
(
  cd moonjang-production
  patch -p0 < /tmp/moonjang-standalone.patch
)

apply_optional_patch() {
  local encoded="$1"
  local decoded_gz="$2.gz"
  local decoded="$2"
  if [[ -s "$encoded" ]]; then
    python3 - "$encoded" "$decoded_gz" <<'PY'
import base64, pathlib, sys
src, dst = map(pathlib.Path, sys.argv[1:3])
dst.write_bytes(base64.b64decode(src.read_text()))
PY
    gzip -dc "$decoded_gz" > "$decoded"
    (
      cd moonjang-production
      patch -p0 < "$decoded"
    )
  fi
}

apply_plain_patch() {
  local encoded="$1"
  local decoded="$2"
  if [[ -s "$encoded" ]]; then
    python3 - "$encoded" "$decoded" <<'PY'
import base64, pathlib, sys
src, dst = map(pathlib.Path, sys.argv[1:3])
dst.write_bytes(base64.b64decode(src.read_text()))
PY
    (
      cd moonjang-production
      patch -p0 < "$decoded"
    )
  fi
}

apply_optional_patch .github/standalone-e2e-fix.patch.gz.b64 /tmp/moonjang-e2e-fix.patch
apply_optional_patch .github/standalone-ui-fix.patch.gz.b64 /tmp/moonjang-ui-fix.patch
apply_plain_patch .github/standalone-collection-fix.patch.b64 /tmp/moonjang-collection-fix.patch

test -s moonjang-production/e2e/standalone.spec.ts
grep -q 'local_posts' moonjang-production/src/shared/localDb.ts
grep -q 'VITE_STANDALONE' moonjang-production/src/shared/api.ts
grep -q 'contentRevision' moonjang-production/src/App.tsx
grep -q 'localEnsureDefaultCollection' moonjang-production/src/shared/localDb.ts
grep -q '기본 서랍' moonjang-production/e2e/standalone.spec.ts
