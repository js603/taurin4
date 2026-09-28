# IDEA2 — Next Chat Handoff — 2026-09-28

## Purpose

This is the exact resume point for the next ChatGPT conversation. M3-D Slice 1C is finished. Do not restart Slice 1C verification or reopen PR #12. Continue with the Android standalone user-flow acceptance Gate.

## Repository / canonical state

- Repository: `js603/taurin4`
- Canonical branch: `idea2`
- Pinned OpenMMO repository: `Julian-adv/OpenMMO`
- Exact OpenMMO pin: `950e081c178d920c10c51f2d31f60c1b3383c925`
- Architecture: Decision B — exact authoritative OpenMMO core embedded in-process behind Tauri/Rust while preserving the WebSocket protocol boundary
- Slice 1C promotion commit: `696c953d35916d3f69083a1f3f23ea6e7f03e09f`
- Recovery checkpoint: `checkpoint/idea2-m3d-slice1c-verified-20260928`

## Official milestone status

- M3-D Gate 0: **VERIFIED / Decision B**
- M3-D Slice 1A: **VERIFIED**
- M3-D Slice 1B: **VERIFIED**
- M3-D Slice 1C: **VERIFIED / COMPLETE**

OpenMMO remains authoritative for movement, combat, monsters, rewards, inventory, persistence and world state. Do not duplicate those rules in React/Tauri.

## Slice 1C final verification

Final verified temporary-PR head:

`8e75722660302591c2c7cd3af5a0c43a86c98a12`

Temporary PR #12:

- title: `feat(idea2): link pinned OpenMMO core into Tauri`
- state: **CLOSED**
- merged: **false**
- never merge/reopen this verification PR

All required workflows on the final head passed:

- Pull Request Quality `36370376213` — SUCCESS
- Windows Playable Entry `36370376394` — SUCCESS
- Android OpenMMO Client `36370376254` — SUCCESS
- OpenMMO Adapter Integration `36370376225` — SUCCESS
- M3-D OpenMMO Tauri Link `36370376217` — SUCCESS
- Android OpenMMO Runtime E2E `36370376209` — SUCCESS
- Android OpenMMO Lifecycle E2E `36370376267` — SUCCESS
- Windows Human Acceptance E2E `36370376261` — SUCCESS

Dedicated M3-D job `108765260098` passed all key steps:

1. actual `OpenMmoEmbeddedController` against the real pinned authoritative core
2. upstream readiness
3. graceful stop/restart with persistent token/state
4. Android ARM64 linker setup
5. feature-linked Tauri Android ARM64 check
6. Android project initialization
7. actual debug APK build with `embedded-openmmo`
8. APK native ARM64 library inspection

Real Adapter job `108765260195` also passed the pinned real-server gameplay regression.

## Important fixes already completed

Do not recreate these fixes:

### Tauri dependency family alignment

Fresh lockfile-free CI had mixed incompatible Tauri internal versions. The verified `src-tauri/Cargo.toml` constrains the family around Tauri 2.11.6, including the compatible runtime/macro/codegen/build/utils lines.

### Android lifecycle state semantics

HP is excluded from reconnect/resume equality because the authoritative world continues simulation while the client is absent. Character/world continuity is still validated with deterministic state.

### Real adapter kobold combat timing

The test uses normal ATTACK input while the aggressive kobold approaches. The server remains authoritative and rejects illegal range/cooldown attempts.

The final race correction accepts a kobold disappearing during approach only if the real server emitted the matching `MonsterDead`. Disappearance without authoritative death remains failure.

## Files promoted directly to `idea2`

The verified versions of these 11 files were applied directly onto the current canonical `idea2` tree rather than merging the diverged PR branch:

1. `.github/workflows/idea2-m3d-openmmo-tauri-link.yml`
2. `.github/workflows/idea2-windows-playable.yml`
3. `.gitignore`
4. `package.json`
5. `scripts/ci/android_openmmo_lifecycle_acceptance.py`
6. `scripts/prepare-openmmo-embedded.py`
7. `src-tauri/Cargo.toml`
8. `src-tauri/src/lib.rs`
9. `src-tauri/src/openmmo_embedded.rs`
10. `src/openmmo/embeddedHost.ts`
11. `src/openmmo/real.integration.test.ts`

The temporary PR branch had diverged from canonical `idea2`, so forcing the PR head onto `idea2` would have discarded canonical commits. The promotion instead reused the exact verified blob SHAs on top of the current `idea2` tree.

## Non-negotiable boundaries

- Exact OpenMMO pin stays fixed unless a future explicit migration Gate changes it.
- OpenMMO remains authoritative.
- Do not recreate combat/monster/dungeon/inventory/persistence rules in taurin4.
- Preserve `LocalGameSession`.
- Preserve the existing external/reachable-server OpenMMO path.
- JS token remains memory-only; never URL/localStorage/sessionStorage.
- Android standalone persistent state must use app-private storage.
- Large desktop runtime data stays on G: where applicable.
- Do not claim Android standalone gameplay verified merely from APK compilation.

## Exact next Gate — Android standalone user-flow acceptance

Goal:

```text
Android app launch
→ Singleplayer
→ embedded authoritative OpenMMO auto-start
→ no host/server URL/token user input
→ automatic loopback OpenMmoAdapter connection/auth
→ Character Lobby
→ EnterGame
→ gameplay
→ safe shutdown
→ app relaunch
→ persisted authoritative state
```

### First implementation action

Inspect only the current startup/bootstrap path needed for this flow:

- `src/App.tsx`
- `src/features/game/ui/OpenMmoBootstrap.tsx`
- `src/openmmo/embeddedHost.ts`
- `src-tauri/src/lib.rs`
- `src-tauri/src/openmmo_embedded.rs`

Determine where the Android `Singleplayer` action currently enters the OpenMMO bootstrap. Wire the already verified native `openmmo_embedded_start` launch config into that path so Android standalone starts automatically without server/token input while leaving the external-server path intact.

### Acceptance evidence required

A PASS must prove on an actual Android runtime/emulator flow, not only by source inspection:

1. app launches successfully
2. user selects Singleplayer
3. embedded authoritative core starts automatically
4. no server URL/token is manually entered
5. frontend receives launch config only after native readiness
6. OpenMmoAdapter connects to loopback and authenticates
7. Character Lobby is usable
8. EnterGame reaches real authoritative gameplay
9. app shutdown stops/drains the embedded core safely
10. relaunch reuses persisted authoritative state/token according to policy
11. existing external-server Android/Windows regressions remain green

Use existing Android Runtime/Lifecycle harnesses where reusable, but do not weaken them into compile-only checks.

## Next-chat bootstrap instruction

`docs/IDEA2_NEXT_CHAT_HANDOFF_20260928.md 기준으로 계속 진행해줘. M3-D Slice 1C는 VERIFIED/COMPLETE 상태이므로 다시 검증하지 말고, 현재 idea2에서 Android standalone user-flow acceptance를 시작해. 먼저 Singleplayer → openmmo_embedded_start → automatic loopback auth/bootstrap 경로만 확인하고 최소 구현부터 진행해.`
