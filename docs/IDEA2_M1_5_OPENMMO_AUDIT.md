# idea2 M1.5 — Original OpenMMO Runtime & Flow Audit

> Reference pin: `Julian-adv/OpenMMO@950e081c178d920c10c51f2d31f60c1b3383c925`
>
> This document separates **SOURCE VERIFIED** facts from **RUNTIME VERIFIED** facts.
> Source inspection never counts as runtime proof.

## 1. Audit purpose

M1.5 exists to understand the original OpenMMO before idea2 replaces presentation,
movement UX, authentication, or persistence.

The audit answers:

- What is required to boot the original server?
- What is required to reach the original character flow?
- Which parts require Google OAuth?
- Which parts can be exercised with the original NPC/agent path?
- Is the full ~73 GB terrain bake required for server/character lifecycle?
- Which original systems should idea2 KEEP / ADAPT / REPLACE / DROP?

## 2. Source-verified architecture

Status: **SOURCE VERIFIED**

Original runtime:

```text
Browser Svelte/Three.js client
        │
        ├─ shared Rust WASM codec
        │
        ▼
binary MessagePack WebSocket
        │
        ▼
Rust authoritative server
        │
        ├─ SQLite state
        ├─ terrain REST API
        ├─ game simulation
        └─ persistent world/character systems
```

Agent runtime:

```text
Rust agent-client
        │
        ├─ same shared protocol
        ├─ same ClientInfo handshake
        ├─ NPC token OR Google device auth
        ▼
same Rust game server
```

The agent is not given a privileged gameplay API. It uses the same game protocol.

## 3. Ports and binds

Status: **SOURCE VERIFIED**

Default ports:

| Port | Purpose |
|---:|---|
| 10004 | Vite browser client |
| 10006 | game WebSocket |
| 10007 | terrain / housing / NPC REST API |
| 10008 | metrics dashboard dev server |

Server defaults:

- WebSocket bind: `127.0.0.1`
- REST bind: `127.0.0.1`
- `--bind 0.0.0.0` exposes the raw non-TLS game port directly.
- Vite proxies `/ws` to `ws://127.0.0.1:10006`.
- Vite proxies `/api` to `http://127.0.0.1:10007`.

idea2 must not infer that the raw OpenMMO WebSocket is internet-safe.

## 4. Mutable state and database

Status: **SOURCE VERIFIED**

Default state directory:

```text
./data
```

State paths include:

```text
data/game_data.db
data/npc_token
data/housing/
data/announcements/
data/cape-textures/
data/banned_names.txt
```

`AuthService::new` creates the SQLite parent directory and opens a bundled SQLite
database through `rusqlite` / `r2d2_sqlite`.

Important idea2 implication:

- OpenMMO is already strongly server-persistent.
- This conflicts with idea2's portable `CharacterPassport` ownership model.
- Do not copy OpenMMO DB ownership rules directly into final idea2 persistence.

## 5. Authentication paths

Status: **SOURCE VERIFIED**

### Browser client

The browser login screen is Google-only.

It requires:

```text
VITE_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_ID
```

The client receives a Google ID token and sends:

```text
Authenticate { google_id_token }
```

If the server starts without Google client IDs, the server itself still starts,
but browser Google authentication is disabled/rejected.

### Operator NPC / local agent

The server supports:

```text
AuthenticateNpc {
  account_name,
  npc_token
}
```

The token is:

- read from `NPC_AUTH_TOKEN` when supplied, or
- generated on first server run at `<state-dir>/npc_token`.

This is the best original-protocol path for isolated CI runtime testing because it
requires no external OAuth secret or browser account.

### Remote user agent

The original agent-client also supports Google OAuth device flow.

That path is intended for a person's own Google account and uses a separate
CLI OAuth client audience.

### idea2 decision boundary

Original Google auth is not automatically the final idea2 LAN identity system.

Preliminary classification: **REPLACE for local/LAN identity**, while preserving the
server-authoritative authenticated-session concept.

## 6. Mandatory protocol handshake

Status: **SOURCE VERIFIED**

The first client message must be:

```text
ClientInfo {
  protocol_version,
  client_kind,
  client_version
}
```

The original agent-client sends:

```text
protocol_version = onlinerpg_shared::PROTOCOL_VERSION
client_kind = "cli"
client_version = stamp_layout_version(...)
```

Messages before ClientInfo are refused.

Protocol/layout mismatches use the established refusal path and close code 4001.
ClientInfo/AuthError are intentionally compatibility-critical.

idea2 should **KEEP** this early incompatibility detection principle.

## 7. Original browser user journey

Status: **SOURCE VERIFIED / runtime verification pending**

```text
LOGIN
  ↓
Google authentication
  ↓
AuthSuccess + character list
  ↓
CHARACTER SELECT
  ├─ select
  ├─ delete
  ├─ rename
  └─ create
       ↓
CHARACTER CREATE
  ├─ class
  ├─ gender
  ├─ stat roll
  └─ name
       ↓
CHARACTER SELECT
       ↓
EnterGame { character_id }
       ↓
JoinSuccess
       ↓
WorldReady
       ↓
GAME
```

The current browser UI limits the account to 3 visible/createable slots.

## 8. Character creation contract

Status: **SOURCE VERIFIED**

Character creation is deliberately two-phase.

First:

```text
RollCharacterStats {
  character_class,
  gender
}
```

Server returns:

```text
CharacterStatsRolled {
  attributes,
  max_hp
}
```

The server keeps those rolled attributes as pending connection state.

Then:

```text
CreateCharacter {
  character_name,
  character_class,
  gender
}
```

Creation without a pending server roll is rejected.

The server also validates player-selectable classes.

idea2 should **KEEP** server-side creation validation and server-generated stats even if
the eventual character creation presentation changes.

## 9. Character lifecycle

Status: **SOURCE VERIFIED / runtime verification pending**

Original protocol supports:

- create
- list on authentication
- select / EnterGame
- delete
- rename
- rename-required entry flow
- logout / return to character select
- reconnect
- automatic re-entry of the previously selected character

The browser keeps `lastCharacterId`. After reconnect authentication succeeds it sends
`EnterGame` for that character again.

The agent-client also handles `CharacterRenameRequired` and retries entry after the
configured rename.

## 10. Terrain dependency

Status: **RUNTIME VERIFIED for server/auth/character/EnterGame lifecycle**

Canonical full terrain generation:

```text
cargo run -p terrain-gen --release -- bake --seed 42
```

Documented full bake:

- 262,144 tiles
- approximately 73 GB under `data/terrain`

The original README explicitly states that without terrain generation:

- terrain API returns 404 for missing terrain
- the rendered world becomes black

The source does **not** describe missing terrain as a mandatory server-start failure.

Therefore M1.5 intentionally tests:

```text
server + SQLite + auth + character lifecycle
WITHOUT full terrain bake
```

Runtime audit run `35824184590` proved that the ~73 GB bake is **not** a prerequisite
for M2 protocol integration through character entry.

With an intentionally empty terrain directory, the original pinned server:

- created/opened SQLite state
- generated the NPC auth token
- started WebSocket on 10006
- started REST on 10007
- authenticated the original agent-client
- rolled character stats
- created and persisted a character
- re-authenticated with that persisted character
- accepted EnterGame
- returned the normal in-game path used by the agent-client
- shut down gracefully

Missing terrain produced warnings/disabled terrain-derived features, not a server-start failure.

## 11. Binary asset dependency

Status: **SOURCE VERIFIED**

Original visual client binary assets are fetched separately:

```text
bash tools/fetch-assets.sh
```

The README identifies models/music/sounds as externally hosted rather than all stored
in Git.

idea2 should not inherit this asset requirement for the Text/Card client.

For original-browser visual-play auditing, specific assets may still be needed later.
Fetch them selectively. Do not pull the entire binary dataset by default.

## 12. Agent-client as a controlled runtime probe

Status: **RUNTIME VERIFIED through EnterGame**

The original agent-client can:

1. send ClientInfo
2. authenticate with NPC token
3. receive AuthSuccess + character list
4. choose or auto-create a character
5. roll starting attributes
6. CreateCharacter
7. EnterGame
8. wait for JoinSuccess
9. immediately send WorldReady

This makes it useful for proving the original server/protocol/character lifecycle without
requiring browser Google OAuth.

It does **not** replace the later visual browser play audit.

Runtime evidence from `idea2 OpenMMO M1.5 Runtime Audit` run `35824184590`:

```text
Authenticated. 0 character(s)
→ Roll 1/20
→ Created character 'M15Audit' (id=1, Knight, Male)
→ SQLite row persisted:
   (1, 'npc_m15_audit', 'M15Audit', 'knight', 'male')
→ reconnect
→ Authenticated. 1 character(s)
→ Entering game with character 1
→ server: Account 'npc_m15_audit' entered game as character 'M15Audit'
```

The audit exposed an important inconsistency in the pinned original client:

- configuration comments describe `llm = "none"` as a mode where schedule/monster AI can drive an NPC without an LLM;
- the actual `run_npc_session` path gates `EnterGame` behind `llm != None`;
- `spawn_llm_task` calls `build_llm_backend` first and returns early for `None`, so the schedule file is not loaded in that path either.

Therefore the pinned revision does **not** fully behave as its configuration comments imply for a generic `llm="none"` agent. This is treated as an original-project bug/regression candidate, not as an idea2 requirement.

For the audit, direct mode was used only to authenticate, roll stats, and create/persist the character. A non-`none` mode was then selected solely to enter the original in-game branch. `EnterGame → JoinSuccess → WorldReady` happens before an LLM response is required, so this proves the original protocol/character-entry path; it does **not** prove that an external LLM drove gameplay.

## 13. LLM vs deterministic game/agent logic

Status: **SOURCE + RUNTIME VERIFIED boundary**

OpenMMO separates responsibilities:

```text
Game Server
  ├─ world simulation
  ├─ monster definitions / combat authority
  ├─ item / drop / dungeon rules
  └─ authoritative validation

Agent Client
  ├─ WebSocket/protocol
  ├─ world-state mirror
  ├─ pathfinding / low-level movement execution
  ├─ event/reflex handling
  └─ optional LLM driver
        └─ high-level intent, conversation, strategy
```

The LLM is therefore **not** the engine that makes the world exist or resolves combat.
The runtime audit loaded the original monster/item/dungeon/NPC definitions and started the world with no LLM service involved.

However, the pinned Agent Client has the `llm="none"` gating inconsistency described above. Do not copy that coupling into idea2. In idea2, deterministic schedules/reflexes/pathfinding and optional LLM high-level reasoning should remain independent modules.

Preliminary idea2 classification:

- server world/monster AI: **KEEP**
- deterministic agent execution/reflex layer: **KEEP/ADAPT**
- LLM high-level reasoning: **OPTIONAL / ADAPT**
- original `llm != None` gate controlling whether a character may EnterGame: **DROP**

## 14. Core gameplay protocol surface

Status: **SOURCE VERIFIED**

The original client exposes protocol actions for at least:

- movement samples / movement commands
- basic player attack
- abilities
- dagger double slash
- respawn
- inventory/equipment interactions
- chat
- world/terrain synchronization
- party / friends
- player trade
- housing / world interactions

The server is authoritative for gameplay resolution.

M1.5 runtime coverage must distinguish a protocol existing from a feature actually played.

## 15. Preliminary migration matrix

This matrix is intentionally conservative. Runtime findings may refine it.

| Original OpenMMO system | idea2 classification | Reason |
|---|---|---|
| authoritative Rust game simulation | **KEEP** | core MMO authority model |
| shared versioned protocol contract | **KEEP** | prevents silent client/server drift |
| ClientInfo/version/layout gate | **KEEP** | strong compatibility boundary |
| character stats rules | **KEEP** | meaningful RPG progression |
| server-side character creation validation | **KEEP** | prevents client-forged characters |
| combat resolution | **KEEP** | valuable mature backend system |
| monster/NPC server logic | **KEEP** | core world behavior |
| inventory/equipment rules | **KEEP** | core progression/economy |
| loot/reward authority | **KEEP** | required for multiplayer integrity |
| chat backend | **KEEP** | compatible with Text-first UI |
| party/trade systems | **KEEP** | MMO value; presentation can change |
| reconnect/session recovery concept | **KEEP** | required for LAN stability |
| coordinate movement backend | **ADAPT** | preserve world position; expose semantic travel/actions |
| combat input/presentation | **ADAPT** | preserve backend; present as attention/card interactions |
| world event presentation | **ADAPT** | map raw events into semantic Text/Card events |
| character-select/create UI | **ADAPT** | preserve lifecycle, replace presentation |
| browser Google login | **REPLACE** for LAN | zero-cost/local identity must not depend on external OAuth |
| server-owned character persistence | **REPLACE/ADAPT** | final target is CharacterPassport + Host World boundary |
| Three.js/Threlte 3D renderer | **DROP** from idea2 client | conflicts with assetless Text-first goal |
| full visual terrain rendering | **DROP** from idea2 client | semantic world representation replaces it |
| 73 GB canonical terrain bake as client prerequisite | **DROP** | must not be required by idea2 |
| GLB visual model dependency | **DROP** | no 3D asset pipeline |
| original BGM/model asset bundle | **DROP** as core dependency | not required for system migration |
| map editor UI | **DROP/DEFER** | outside first playable migration |
| Pulse admin dashboard | **DEFER** | useful operationally but not M2 gameplay |
| original metrics/geolocation stack | **DEFER** | not needed for LAN vertical slice |

## 16. M1.5 runtime audit automation

idea2 workflow:

```text
.github/workflows/idea2-openmmo-audit.yml
```

It checks out the exact pinned OpenMMO revision without LFS, then attempts:

```text
build original server + agent-client
→ start original server with empty terrain directory
→ verify WS 10006 + REST 10007
→ verify game_data.db
→ verify generated npc_token
→ run original agent-client over original protocol
→ AuthSuccess
→ stat roll/create if needed
→ EnterGame
→ JoinSuccess / WorldReady
→ inspect SQLite for persisted character
→ graceful server shutdown
```

No OpenMMO binary is published as a taurin4 artifact.
Only audit logs may be retained temporarily.

## 17. Remaining M1.5 runtime gates

Server lifecycle — run `35824184590`:

- [x] original pinned server actually builds
- [x] original server starts with no Google OAuth configured
- [x] original server starts without a full terrain bake
- [x] SQLite DB is created
- [x] NPC token is generated
- [x] original agent authenticates with the generated token
- [x] character list is returned
- [x] character is created/persisted when absent
- [x] reconnect returns the persisted character
- [x] EnterGame succeeds
- [x] server records the character as entered in-game
- [x] graceful shutdown succeeds

Still pending:

- [ ] original browser client WASM/build prerequisites are validated
- [ ] original browser bundle starts over HTTP
- [ ] original browser Google login is executed or explicitly recorded as external-OAuth-only
- [ ] visual world/core play audit is completed to the extent possible without the huge asset/terrain download

M1.5 is not complete until source-only findings and actual runtime findings are clearly separated.
