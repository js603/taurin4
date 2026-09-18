from __future__ import annotations

import argparse
from pathlib import Path
import shutil

parser = argparse.ArgumentParser()
parser.add_argument("--dest", required=True)
parser.add_argument("patterns", nargs="+")
args = parser.parse_args()

dest = Path(args.dest)
dest.mkdir(parents=True, exist_ok=True)

found = []
for pattern in args.patterns:
    for path in Path(".").glob(pattern):
        if not path.is_file():
            continue
        target = dest / path.name
        index = 2
        while target.exists():
            target = dest / f"{path.stem}-{index}{path.suffix}"
            index += 1
        shutil.copy2(path, target)
        found.append(target)

if not found:
    raise SystemExit(f"No artifacts found for patterns: {args.patterns}")

print("\n".join(str(p) for p in found))
