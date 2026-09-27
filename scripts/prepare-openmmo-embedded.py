#!/usr/bin/env python3
"""Prepare the exact pinned OpenMMO source tree for taurin4 embedded builds.

The OpenMMO checkout is build input, not a copied gameplay implementation. The
script keeps the source outside git tracking (`/openmmo/` is ignored), pins it to
the canonical commit, configures a sparse checkout, and generates only the
reusable server library entrypoint proven by M3-D Slice 1B.

Existing non-generated local changes in the checkout are never discarded.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

PIN = "950e081c178d920c10c51f2d31f60c1b3383c925"
REMOTE = "https://github.com/Julian-adv/OpenMMO.git"
SPARSE_PATHS = [
    ".cargo",
    "agent-client",
    "server",
    "shared",
    "terrain",
    "tools",
    "data-src",
    "data",
    "client/public/models/objects",
]
GENERATED_RELATIVE = "server/src/lib.rs"


def run(*args: str, cwd: Path | None = None, capture: bool = False) -> str:
    completed = subprocess.run(
        list(args),
        cwd=cwd,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
    )
    return completed.stdout.strip() if capture else ""


def git(openmmo: Path, *args: str, capture: bool = False) -> str:
    return run("git", *args, cwd=openmmo, capture=capture)


def ensure_clean_enough(openmmo: Path) -> None:
    status = git(openmmo, "status", "--porcelain", "--untracked-files=all", capture=True)
    unexpected: list[str] = []
    for line in status.splitlines():
        path = line[3:].strip() if len(line) >= 4 else ""
        if path == GENERATED_RELATIVE:
            continue
        unexpected.append(line)
    if unexpected:
        details = "\n".join(unexpected[:20])
        raise SystemExit(
            "refusing to replace an OpenMMO checkout with local changes. "
            "Commit/stash them or use a clean generated checkout.\n" + details
        )


def ensure_checkout(repo_root: Path, openmmo: Path) -> None:
    if openmmo.exists() and not (openmmo / ".git").exists():
        raise SystemExit(f"{openmmo} exists but is not a git checkout")

    if not openmmo.exists():
        openmmo.mkdir(parents=True)
        git(openmmo, "init")
        git(openmmo, "remote", "add", "origin", REMOTE)
        git(openmmo, "sparse-checkout", "init", "--cone")
    else:
        origin = git(openmmo, "remote", "get-url", "origin", capture=True)
        if origin.rstrip("/") != REMOTE.rstrip("/"):
            raise SystemExit(
                f"refusing to reuse {openmmo}: origin is {origin!r}, expected {REMOTE!r}"
            )
        ensure_clean_enough(openmmo)
        git(openmmo, "sparse-checkout", "init", "--cone")

    git(openmmo, "sparse-checkout", "set", *SPARSE_PATHS)
    git(openmmo, "fetch", "--depth=1", "--filter=blob:none", "origin", PIN)

    current = git(openmmo, "rev-parse", "HEAD", capture=True) if (openmmo / ".git" / "HEAD").exists() else ""
    if current != PIN:
        ensure_clean_enough(openmmo)
        git(openmmo, "checkout", "--detach", "FETCH_HEAD")

    actual = git(openmmo, "rev-parse", "HEAD", capture=True)
    if actual != PIN:
        raise SystemExit(f"OpenMMO pin mismatch: expected {PIN}, got {actual}")

    extractor = repo_root / "scripts" / "ci" / "extract_openmmo_server_lib.py"
    run(sys.executable, str(extractor), "--openmmo", str(openmmo), cwd=repo_root)

    generated = openmmo / GENERATED_RELATIVE
    if not generated.is_file():
        raise SystemExit(f"embedded OpenMMO library was not generated: {generated}")
    generated_text = generated.read_text(encoding="utf-8")
    for required in ("pub async fn run_embedded_server", "EmbeddedServerReady", PIN):
        if required not in generated_text:
            raise SystemExit(f"generated OpenMMO library is missing {required!r}")


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    openmmo = repo_root / "openmmo"
    ensure_checkout(repo_root, openmmo)
    print(f"OpenMMO embedded source ready at {PIN}: {openmmo}")


if __name__ == "__main__":
    main()
