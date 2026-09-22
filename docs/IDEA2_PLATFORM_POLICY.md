# idea2 platform policy

> Canonical status: see `docs/IDEA2_MASTER_RECORD.md`.

## First-class build/play platforms

Windows and Android are developed in parallel as build/play targets.

A feature that changes shared hosting, persistence, networking, or gameplay runtime
must keep the common Rust core portable and must not break either platform's build.

## Windows

Windows is currently the primary runtime validation platform.

- React client
- Tauri shell
- embedded Rust game host
- LAN client
- LAN host
- **actual LAN runtime Gate: Windows PC ↔ Windows PC**

Current M1 multiplayer verification is limited to two Windows PCs.

Required M1 runtime proof:

1. PC A starts LAN Host.
2. PC B connects.
3. HostHello / Hello / ClientAccepted complete.
4. Ping/Pong works.
5. Host reports one connected client.
6. PC B disconnects and Host returns to zero clients.
7. PC B reconnects successfully.

Manual host address is acceptable for the first proof.
Automatic LAN discovery is added only after basic connection is proven.

## Android

Android remains a first-class build/play target.

- React client
- Tauri APK
- shared Rust host core embedded in the application
- Android project initialization in CI
- Android Rust/NDK compile/link
- Debug APK artifact generation

The Android host is not a desktop sidecar executable. The shared host core is linked
inside the Android application.

### Current Android LAN testing policy

The architecture keeps Android Host/Client capability, but **Android LAN runtime tests
are not part of the current validation Gate**.

Currently excluded from required runtime testing:

- Android ↔ Windows LAN
- Android ↔ Android LAN

This exclusion is a test-scope decision, not removal of Android networking capability.

Background survival, screen-off hosting, foreground services, wake locks, and vendor
battery-management behavior are also outside the current Gate.

## Shared Rust boundary

The platform-independent crates are:

- `taurin4-game-network`: bootstrap LAN control protocol
- `taurin4-game-server-core`: Host lifecycle and WebSocket listener
- `taurin4-game-persistence`: Character Passport and Host World contracts

Neither the server core nor the protocol crate depends on Tauri.

Tauri exposes Host lifecycle commands:

- `host_status`
- `host_start`
- `host_stop`

React gameplay remains behind `GameSession`. Game logic must not become a collection
of Tauri IPC calls.

## Character ownership

A player's durable character target model is a portable Character Passport owned by the
player device. A hosted world's durable state is owned by the Host as a World Save.

During multiplayer, Host/server state remains authoritative. Imported character data
must be validated rather than blindly trusted.

The current implementation provides schema/validation foundations only. Durable file
persistence and multiplayer reconciliation are later milestones.

## OpenMMO migration rule

OpenMMO remains pinned external reference material during the early migration.

Do not copy the original desktop server `main.rs` wholesale into platform runtimes.
Separate game/server concepts from CLI, OS signal handling, process lifecycle, and other
desktop/server-only concerns.

Before replacing OpenMMO behavior, execute the formal M1.5 Original Runtime & Flow Audit
defined in `docs/IDEA2_MASTER_RECORD.md`.

## Completion policy

"Works on PC" does not mean Android may stop building.

"Android APK builds" does not mean Android LAN runtime is currently verified.

The current policy is therefore:

```text
Windows:
  build + play + PC↔PC LAN runtime verification

Android:
  build + play foundation + shared Host Core compile/link
  LAN runtime verification deferred
```
