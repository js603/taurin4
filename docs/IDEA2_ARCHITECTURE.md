# idea2 — Floating Text MMO client

## Goal

Build a text-first, asset-light RPG client that can eventually drive an OpenMMO-derived
server while remaining fully runnable as a normal React/Vite web application.

## Fixed principles

1. **Web-first game client** — game UI and game commands must work without Tauri IPC.
2. **Optional Tauri runtime** — Tauri is reserved for packaging, local host lifecycle,
   LAN discovery, OS integration, and local file access.
3. **Server authority** — multiplayer truth belongs to the Rust game server.
4. **Text-first presentation** — no production dependency on character art, animation
   sheets, GLB models, or environment textures.
5. **Attention-driven UI**:
   - ordinary event → log
   - nearby interaction → floating card
   - decision → focus card
   - immediate reaction → critical modal
6. **Compressed travel** — players choose meaningful locations rather than issuing
   north/east movement commands. Routine travel is compressed; encounters interrupt it.
7. **Backend isolation** — React talks to the GameSession port. The current local
   simulation and the future OpenMMO adapter share that boundary.

## OpenMMO reference pin

Reference repository: `Julian-adv/OpenMMO`

Initial inspected revision:

`950e081c178d920c10c51f2d31f60c1b3383c925`

The reference client uses a WebSocket with binary messages. Its TypeScript socket layer
calls WASM exports from the Rust `shared` crate to serialize `ClientMessage` and
deserialize `ServerMessage`. The future adapter should preserve that contract instead
of re-inventing the wire format.

OpenMMO source is reference material and remains outside the taurin4 source tree during
the first migration stage. Its PolyForm Noncommercial 1.0.0 terms must be reviewed
before deciding whether any original source is incorporated into a distributable build.

## Migration sequence

### M0 — Floating Text Vertical Slice

- deterministic local GameSession
- location cards
- compressed travel
- encounter interruption
- rapid basic attacks
- telegraph → dodge/guard
- perfect evade → counter
- reward card
- responsive Web/PWA/Tauri-compatible React UI

### M1 — OpenMMO adapter

Implement `GameSession` using the pinned OpenMMO WebSocket protocol and Rust/WASM
codec boundary. Start with connection, handshake, authentication strategy, character
entry, nearby world events, attack results, and inventory updates.

### M2 — LAN host

Run the authoritative Rust server as a local host process, then add automatic LAN
discovery. Remote clients continue to use the same GameSession protocol.

### M3 — Native migration

Replace only the OpenMMO systems that conflict with the final game design. UI remains
unchanged because it depends on GameSession rather than OpenMMO or Tauri directly.
