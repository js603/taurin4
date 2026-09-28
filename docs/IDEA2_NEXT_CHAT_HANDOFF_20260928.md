# IDEA2 — Next Chat Handoff — 2026-09-28

## Purpose

This document is the exact resume point for the next ChatGPT conversation. Do not restart M3-D planning from the beginning. Continue from the active M3-D Slice 1C verification state below.

## Repository / active work

- Repository: `js603/taurin4`
- Canonical branch: `idea2`
- Temporary verification PR: **#12** — `feat(idea2): link pinned OpenMMO core into Tauri`
- PR branch: `ci/idea2-m3d-openmmo-tauri-link-20260927`
- PR state: **OPEN / DRAFT / DO NOT MERGE**
- Exact paused implementation HEAD: `60a439ad916f81288fd58c39e4afab6dfb899f5f`
- Recovery checkpoint: `checkpoint/idea2-m3d-slice1c-paused-20260928`
- Pinned OpenMMO repository: `Julian-adv/OpenMMO`
- Exact OpenMMO pin: `950e081c178d920c10c51f2d31f60c1b3383c925`

## Official milestone status

- M3-D Gate 0: **VERIFIED / Decision B**
- M3-D Slice 1A: **VERIFIED**
- M3-D Slice 1B: **VERIFIED**
- M3-D Slice 1C: **IMPLEMENTED-NOT-VERIFIED**

Decision B means the OpenMMO authoritative server core is embedded in-process behind Tauri/Rust. Do not duplicate gameplay rules in React.

## Slice 1C implementation already present on PR #12

The current PR already contains the real linkage work. Do not recreate these changes from scratch.

Changed files currently associated with PR #12:

1. `.github/workflows/idea2-m3d-openmmo-tauri-link.yml`
2. `.github/workflows/idea2-windows-playable.yml`
3. `.gitignore`
4. `docs/IDEA2_MASTER_RECORD.md`
5. `docs/IDEA2_M3D_SLICE1.md`
6. `package.json`
7. `scripts/prepare-openmmo-embedded.py`
8. `src-tauri/Cargo.toml`
9. `src-tauri/src/lib.rs`
10. `src-tauri/src/openmmo_embedded.rs`
11. `src/openmmo/embeddedHost.ts`

The embedded OpenMMO build input is intentionally generated under `src-tauri/openmmo/` and git-ignored. `src-tauri/Cargo.toml` references `openmmo/server` so Android Gradle/Tauri packaging can see the path dependency.

`coreLinked=true` must only be reported after the real upstream authoritative server reaches readiness.

## Important fixes that are ALREADY committed

Do not reapply these three fixes in the next chat.

### 1. Android lifecycle HP comparison

`android_openmmo_lifecycle_acceptance.py` already excludes HP from both soft resume and force-stop reconnect state equality. HP is non-deterministic because the authoritative world continues simulating while the client is absent. Character/world continuity is still checked through max HP, MP/max MP, dungeon floor, position, reconnect logs, and credential policy.

### 2. Real Adapter kobold combat timing

`real.integration.test.ts` already starts an ATTACK pump after the real encounter enters combat and keeps sending inputs while the kobold approaches / doors are opened / pathing occurs. The server remains authoritative and rejects out-of-range or cooldown-early inputs. Do not return to the older passive `wait until <= 2.2m` design.

### 3. Tauri/plugin version pinning

The Rust Tauri dependency was already changed to the exact compatible line required by the pinned websocket plugin. Current intent at the paused head is:

- `tauri = "=2.11.6"`
- `tauri-plugin-store = "=2.4.5"`
- `tauri-plugin-websocket = "=2.4.3"`

This was done after exact pinning exposed that `tauri-plugin-websocket 2.4.3` requires Tauri `^2.11.6`.

## Latest CI state at paused HEAD

Paused HEAD: `60a439ad916f81288fd58c39e4afab6dfb899f5f`

Latest pull-request workflow results:

- Pull Request Quality `36361234287` — **SUCCESS**
- Android OpenMMO Lifecycle `36361234292` — **FAILURE**
- Windows Human Acceptance `36361234336` — **FAILURE**
- Windows Playable `36361234364` — **FAILURE**
- Android Client APK `36361234366` — **FAILURE**
- Android OpenMMO Runtime E2E `36361234456` — **FAILURE**
- M3-D OpenMMO Tauri Link `36361234459` — **FAILURE**
- Real OpenMMO Adapter `36361234466` — **FAILURE**

Therefore do NOT assume the previous three fixes made the latest head green. They are already present, but the latest head has new/current failures that must be diagnosed from their actual logs.

## Exact next action

Start with the dedicated M3-D Tauri Link failure, not with broad code edits.

- Run: `36361234459`
- Failed job: `108738707917`
- Failed step: **Start, stop, restart the real OpenMMO core through Tauri controller**

Everything before this step in that job succeeded:

- checkout
- Rust setup
- Linux Tauri system packages
- exact pinned OpenMMO source preparation
- pin verification / generated library verification
- verification that checkout lives under `src-tauri`
- frontend dependency install
- Cargo metadata
- Tauri compile with `embedded-openmmo`
- embedded-feature tests

The Android ARM64/link/APK steps were skipped because the host runtime controller smoke failed first.

### Resume procedure

1. Fetch the logs for job `108738707917` once.
2. Inspect only the failing host-runtime smoke step and determine its concrete error.
3. Apply the smallest correction that preserves upstream OpenMMO gameplay rules.
4. Use one new head for validation.
5. Read workflow state once per meaningful checkpoint. If queued/in-progress, stop polling in that response.
6. If other workflows still fail on that same new head, inspect only their failed steps; do not reuse historical causes without confirming current logs.

## Non-negotiable constraints

- OpenMMO remains authoritative for movement, combat, monsters, rewards, inventory, persistence, and world state.
- Do not duplicate authoritative gameplay logic in React.
- Preserve LocalGameSession and the existing external-server OpenMMO path.
- Keep auth token memory-only.
- Android standalone uses app-private persistent state.
- Temporary PR #12 must eventually be **CLOSED WITHOUT MERGE**.
- Promote validated files directly to `idea2` only after the complete Slice 1C Gate is green.
- Do not weaken tests merely to force a pass; correct test semantics only when the authoritative world legitimately makes a value non-deterministic.

## Slice 1C completion criteria

Slice 1C becomes **VERIFIED** only after the active implementation proves all required regressions and specifically:

- real `OpenMmoEmbeddedController` start
- real upstream readiness
- `coreLinked=true` only after readiness
- explicit graceful stop
- restart using persistent app-private state/token
- Android ARM64 feature-linked compile
- actual feature-linked Android APK packaging
- existing Windows / Android / real-adapter regression gates remain green

After Slice 1C is VERIFIED:

1. Promote the validated PR #12 files directly to `idea2` without merging the PR.
2. Close PR #12 with `merged=false`.
3. Create a verified recovery checkpoint such as `checkpoint/idea2-m3d-slice1c-verified-20260928` (use the actual completion date if later).
4. Update `docs/IDEA2_MASTER_RECORD.md` and `docs/IDEA2_M3D_SLICE1.md`.
5. Begin the next stage: actual Android standalone user flow acceptance:
   `app launch -> Singleplayer -> embedded authoritative OpenMMO auto-start -> automatic local connection/auth/lobby -> gameplay -> shutdown -> relaunch persistence`.

## Suggested first instruction in the next chat

`docs/IDEA2_NEXT_CHAT_HANDOFF_20260928.md 기준으로 PR #12의 M3-D Slice 1C를 계속 진행해줘. 먼저 run 36361234459 / job 108738707917의 실패 step만 확인해.`
