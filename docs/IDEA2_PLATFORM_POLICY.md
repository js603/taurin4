# idea2 platform policy

## First-class platforms

From this milestone onward, Windows and Android are developed in parallel.

A feature that changes hosting, persistence, networking, or gameplay runtime is not
considered platform-complete until it at least compiles for both platforms and its
shared core has automated tests.

### Windows

- React client
- Tauri shell
- Rust game host
- LAN client
- LAN host

### Android

- React client
- Tauri shell
- Rust game host embedded in the app
- LAN client
- LAN host

The Android host is not a desktop sidecar executable. The host core runs inside the
Android application process on a dedicated Rust thread with its own Tokio runtime.

The first Android-host target is **foreground hosting**. Background survival, screen-off
hosting, foreground services, wake locks, and aggressive vendor battery policies are a
separate milestone and must not be assumed until tested on real devices.

## Shared Rust boundary

The migration begins with three platform-independent crates:

- `taurin4-game-network`: bootstrap LAN control protocol
- `taurin4-game-server-core`: host lifecycle and WebSocket listener
- `taurin4-game-persistence`: separate Character Passport and Host World schemas

Neither the server core nor the protocol crate depends on Tauri.

Tauri exposes only host lifecycle commands at this stage:

- `host_status`
- `host_start`
- `host_stop`

The React gameplay UI remains behind `GameSession`, so browser play and future
OpenMMO protocol integration do not become Tauri-IPC gameplay implementations.

## Character ownership

A player's durable character is a portable Character Passport owned by the player
device. A hosted world's durable state is a World Save owned by the host.

During multiplayer, the host remains authoritative. Imported character data is never
blindly trusted; validation and later server-side rule checks happen before admission.

## OpenMMO migration rule

OpenMMO remains pinned reference material. We do not copy its desktop server `main.rs`
into Android. Systems are extracted conceptually behind platform-neutral crates.

The future OpenMMO live adapter will preserve its shared Rust/WASM protocol boundary,
but desktop-only concerns such as CLI parsing, process signals, and server application
lifecycle remain outside the common core.
