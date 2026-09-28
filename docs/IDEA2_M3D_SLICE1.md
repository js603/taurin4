# M3-D Slice 1 — Embedded OpenMMO controller

Status: **Slice 1A VERIFIED / Slice 1B VERIFIED / Slice 1C VERIFIED**

Updated: 2026-09-28 (Asia/Seoul)

Pinned OpenMMO: `950e081c178d920c10c51f2d31f60c1b3383c925`

Architecture decision: embed the exact pinned authoritative OpenMMO server core in the Tauri Rust process while preserving the existing WebSocket protocol boundary. OpenMMO owns authoritative movement, combat, monster, reward, inventory, persistence and world-state rules; those rules are not duplicated in React/Tauri.

## Slice 1A — VERIFIED

Native ownership boundary established:

- `OpenMmoEmbeddedController`
- Tauri app-private OpenMMO storage layout
- explicit status / prepare / stop commands
- typed frontend bridge
- persistent state directory survives stop
- existing Windows / Android external-server regressions remained green

Verification PR #10: **CLOSED / merged=false**.

Recovery checkpoint:

`checkpoint/idea2-m3d-slice1a-verified-20260927`

## Slice 1B — VERIFIED

The exact pinned OpenMMO server was transformed at build/test time into a reusable library entrypoint without copying gameplay rules.

Verified authoritative path:

```text
caller config
→ run_embedded_server()
→ original OpenMMO GameState/bootstrap
→ original world/combat/monster/movement tasks
→ loopback WebSocket readiness + in-memory NPC token
→ explicit caller-owned shutdown
→ original drain + final persistence
→ restart from same state/token
```

Verified head:

`aa520df43bdacd1452e275a539a2b6d37017bd57`

Final evidence:

- Pull Request Quality `36319065969` — SUCCESS
- Core Extraction `36319065965` — SUCCESS
- job `108619250201` — SUCCESS
- host OpenMMO library check — SUCCESS
- real HTTP 101 WebSocket — SUCCESS
- graceful shutdown — SUCCESS
- persisted `game_data.db` + `npc_token` — SUCCESS
- restart using same state root/token — SUCCESS
- Android ARM64 library check — SUCCESS

Evidence artifact: `idea2-m3d-openmmo-core-extraction`, artifact `10931169956`.

Verification PR #11: **CLOSED / merged=false**.

Recovery checkpoint:

`checkpoint/idea2-m3d-slice1b-verified-20260927`

## Slice 1C — actual Tauri linkage — VERIFIED

Verified path:

```text
Tauri OpenMmoEmbeddedController.start()
→ exact pinned OpenMMO source
→ extracted run_embedded_server()
→ app-private state/data paths
→ loopback readiness
→ memory-only token handoff
→ existing OpenMmoAdapter
→ explicit stop
→ persisted authoritative restart
```

Verification branch:

`ci/idea2-m3d-openmmo-tauri-link-20260927`

Final verified PR head:

`8e75722660302591c2c7cd3af5a0c43a86c98a12`

Temporary verification PR #12: **CLOSED / merged=false / never merged**.

Direct promotion to `idea2`:

`696c953d35916d3f69083a1f3f23ea6e7f03e09f`

The promotion did not fast-forward the temporary PR branch because `idea2` had diverged. Instead, the exact verified blob versions of the 11 changed files were applied on top of the current `idea2` tree, preserving the canonical branch's newer commits.

### Verified implementation

1. `scripts/prepare-openmmo-embedded.py`
   - creates/reuses ignored `src-tauri/openmmo/` build input
   - verifies `Julian-adv/OpenMMO`
   - checks out exact commit `950e081c178d920c10c51f2d31f60c1b3383c925`
   - invokes the already verified Slice 1B extraction transform
   - refuses to discard unexpected local changes
2. `src-tauri/Cargo.toml`
   - optional exact-pin `onlinerpg-server` path dependency
   - `embedded-openmmo` feature
   - Tauri 2.11.6 internal crate family constrained to compatible versions for lockfile-free CI
3. `src-tauri/src/openmmo_embedded.rs`
   - dedicated Rust thread + Tokio runtime owns the embedded authoritative core
   - app-private persistent paths
   - loopback ephemeral WebSocket/API ports
   - NPC token held in native memory
   - `coreLinked=true` only after real upstream readiness
   - graceful shutdown waits for upstream persistence completion
   - restart reuses persisted token/database
4. `src-tauri/src/lib.rs` / `src/openmmo/embeddedHost.ts`
   - native start/status/stop bridge with typed frontend launch config
5. Android build Gate
   - Android ARM64 feature-linked Cargo check
   - real Tauri Android project initialization
   - actual debug APK build using `--features embedded-openmmo --target aarch64`
   - APK native library inspection for authoritative OpenMMO marker
6. Existing external/reachable-server paths remain regression-protected.

### Final verification evidence

Final head `8e75722660302591c2c7cd3af5a0c43a86c98a12`:

- Pull Request Quality `36370376213` — SUCCESS
- Windows Playable Entry `36370376394` — SUCCESS
- Android OpenMMO Client `36370376254` — SUCCESS
- OpenMMO Adapter Integration `36370376225` — SUCCESS
- M3-D OpenMMO Tauri Link `36370376217` — SUCCESS
- Android OpenMMO Runtime E2E `36370376209` — SUCCESS
- Android OpenMMO Lifecycle E2E `36370376267` — SUCCESS
- Windows Human Acceptance E2E `36370376261` — SUCCESS

M3-D job `108765260098` specifically passed all required executable steps:

- Step 14 — actual Tauri controller against real pinned authoritative core — SUCCESS
- Step 15 — Android ARM64 linker configuration — SUCCESS
- Step 16 — feature-linked Tauri library Android ARM64 check — SUCCESS
- Step 17 — Android project initialization — SUCCESS
- Step 18 — actual Android APK build with authoritative core linked — SUCCESS
- Step 19 — feature-linked APK inspection — SUCCESS

The real adapter regression job `108765260195` also passed the real pinned OpenMMO server build, auth/movement/inventory flow, `old_crypt` traversal, authoritative kobold combat, browser codec preparation and taurin4 build.

### Final race correction

The last failing Adapter Integration run showed the authoritative server had already killed kobold `m1` while the attack pump was active during approach, but the test still required the monster to remain in semantic destinations at the next checkpoint. The test was corrected to accept early disappearance only when the real server emitted the matching `MonsterDead` event. Disappearance without `MonsterDead` remains a failure. No OpenMMO gameplay rule was weakened or replaced.

### Security / compatibility boundaries

- JS token persistence remains forbidden.
- token is not placed in URL, localStorage or sessionStorage.
- external/reachable-server path remains available.
- `coreLinked=true` is tied to real readiness only.
- no combat/monster/dungeon/inventory authority is recreated in taurin4.

## Slice 1C PASS — COMPLETE

All Slice 1C completion criteria are satisfied:

1. real `OpenMmoEmbeddedController` start — VERIFIED
2. upstream readiness before `coreLinked=true` — VERIFIED
3. graceful stop/persistence — VERIFIED
4. restart with persistent app-private state/token — VERIFIED
5. Android ARM64 feature-linked compile — VERIFIED
6. actual feature-linked Android APK — VERIFIED
7. Windows / Android / real-adapter regressions — VERIFIED

## Next Gate — Android standalone user-flow acceptance

The next work starts from the promoted `idea2` implementation and must prove the actual end-user flow:

```text
Android app launch
→ Singleplayer
→ embedded authoritative OpenMMO auto-start
→ no server URL/token input
→ automatic local OpenMmoAdapter connection/auth
→ Character Lobby
→ EnterGame / gameplay
→ safe shutdown
→ app relaunch
→ persisted authoritative state
```

Do not call Android standalone gameplay VERIFIED merely because compile/APK packaging already passed. The next Gate requires actual runtime/user-flow acceptance evidence.
