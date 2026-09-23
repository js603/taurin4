# idea2 M1 — Windows PC ↔ Windows PC LAN Runtime Test

> Canonical project state: `docs/IDEA2_MASTER_RECORD.md`

This procedure is the runtime Gate for M1.

Android LAN runtime is intentionally excluded from this Gate.

## Preconditions

- Two Windows PCs are on the same Wi-Fi or Ethernet LAN.
- Both PCs run the same idea2 Windows test build.
- Port `10006/TCP` is available on the Host PC.
- Windows Defender Firewall allows the taurin4 executable on the **Private** network.

## PC A — Host

1. Start taurin4.
2. In **GAME HOST**, press `LAN Host`.
3. Confirm:
   - `LAN HOST ONLINE`
   - port `10006`
   - `0 CLIENTS`
4. Find PC A's LAN IPv4 address.

PowerShell:

```powershell
ipconfig
```

Use the IPv4 address of the active Wi-Fi/Ethernet adapter, for example:

```text
192.168.0.15
```

Do not use:

- `127.0.0.1`
- VPN adapter addresses
- disconnected adapter addresses

The Host binds to `0.0.0.0:10006`, which means clients must connect using PC A's
actual LAN IPv4 address.

## Windows Firewall

On first Host launch, Windows may ask whether taurin4 can communicate on the network.

Allow **Private networks**.

If no prompt appears and PC B cannot connect, verify the firewall rule before changing
application code.

Optional connectivity check from PC B:

```powershell
Test-NetConnection 192.168.0.15 -Port 10006
```

Expected:

```text
TcpTestSucceeded : True
```

Replace `192.168.0.15` with PC A's actual address.

## PC B — Client

1. Start the same taurin4 build.
2. Leave **GAME HOST** offline.
3. In **LAN CLIENT**, enter:

```text
192.168.0.15:10006
```

4. Press `연결`.

Expected Client progression:

```text
CONNECTING
→ HANDSHAKING
→ CONNECTED
```

Expected Client details:

- Host name: `idea2 host`
- endpoint: `ws://<PC-A-IP>:10006`
- Ping RTT appears after connection

Expected PC A:

```text
CLIENTS 0
→ CLIENTS 1
```

## Protocol proof

A successful connection proves this control flow:

```text
PC B -> TCP/WebSocket connect
PC A -> HostHello
PC B -> Hello { client_id, platform=windows }
PC A -> ClientAccepted
PC B -> Ping
PC A -> Pong
```

## Disconnect proof

On PC B, press `연결 해제`.

Expected:

- PC B: `CLIENT OFFLINE`
- PC A: `CLIENTS 1 → 0`

## Reconnect proof

Reconnect PC B using the same address.

Expected:

- `CONNECTING → HANDSHAKING → CONNECTED`
- PC A returns to `CLIENTS 1`
- Ping RTT is shown again

## Unexpected disconnect / retry proof

With PC B connected, stop PC A's Host.

Expected PC B:

```text
CONNECTED
→ RECONNECTING
```

The Client uses bounded retry delays:

- 0.5 s
- 1.5 s
- 3.0 s

It must not retry forever.

Restart PC A Host before the retry limit is exhausted.

Expected PC B:

```text
RECONNECTING
→ HANDSHAKING
→ CONNECTED
```

If all retries are exhausted, PC B should enter `CONNECTION ERROR`. The user may then
press connect again manually.

## M1 PASS criteria

All of the following are required:

- [ ] PC A can start LAN Host.
- [ ] PC B can reach TCP port 10006 over the real LAN.
- [ ] PC B reaches CONNECTED.
- [ ] HostHello protocol version is accepted.
- [ ] PC A shows one connected client.
- [ ] Ping/Pong returns a measurable RTT.
- [ ] Manual disconnect changes PC A from 1 client to 0.
- [ ] Manual reconnect succeeds.
- [ ] Unexpected disconnect enters bounded RECONNECTING state.
- [ ] Host restart allows reconnect before retry exhaustion.
- [ ] No crash or frozen UI on either PC.

Only after this checklist passes is **M1 COMPLETE**.

## Not part of M1

Do not expand scope during this Gate.

Not included yet:

- automatic LAN discovery
- character synchronization
- shared gameplay state
- OpenMMO protocol
- Android LAN runtime
- Android ↔ Windows runtime
- Internet matchmaking

After M1 passes, the next formal milestone is **M1.5 — Original OpenMMO Runtime & Flow Audit**.
