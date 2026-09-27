#!/usr/bin/env python3
"""Generate a reusable library entrypoint from the exact pinned OpenMMO server main.rs.

This is intentionally a narrow compatibility transform for M3-D Slice 1B. It
moves no gameplay rules and edits no authoritative game modules. The generated
lib keeps the pinned bootstrap body intact while replacing process-only inputs:

- Args::parse() -> caller supplied argv parsed by the same upstream clap Args
- OS signal -> caller supplied oneshot shutdown receiver
- tracing global init -> idempotent try_init for in-process restart

It also reports listener readiness and the already-created NPC token back to the
native owner so Tauri can keep the token in memory only.
"""

from __future__ import annotations

import argparse
from pathlib import Path

PIN = "950e081c178d920c10c51f2d31f60c1b3383c925"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def generate(main_rs: Path, lib_rs: Path) -> None:
    text = main_rs.read_text(encoding="utf-8")

    text = replace_once(
        text,
        "#[tokio::main]\nasync fn main() -> ExitCode {\n",
        "#[derive(Debug, Clone)]\n"
        "pub struct EmbeddedServerReady {\n"
        "    pub websocket_addr: std::net::SocketAddr,\n"
        "    pub api_addr: std::net::SocketAddr,\n"
        "    pub npc_token: String,\n"
        "}\n\n"
        "pub async fn run_embedded_server(\n"
        "    cli_args: Vec<String>,\n"
        "    external_shutdown: tokio::sync::oneshot::Receiver<()>,\n"
        "    ready_tx: tokio::sync::oneshot::Sender<EmbeddedServerReady>,\n"
        ") -> ExitCode {\n",
        "main entrypoint",
    )

    text = replace_once(
        text,
        "    tracing_subscriber::fmt()\n",
        "    let _ = tracing_subscriber::fmt()\n",
        "tracing initializer binding",
    )
    text = replace_once(
        text,
        "        .init();\n\n    let args = Args::parse();\n",
        "        .try_init();\n\n    let args = Args::parse_from(cli_args);\n",
        "tracing/CLI process inputs",
    )

    text = replace_once(
        text,
        "    let auth_ctx = Arc::new(AuthContext {\n        google,\n        npc_token,\n        admin_emails,\n    });\n",
        "    let embedded_npc_token = npc_token.clone();\n"
        "    let auth_ctx = Arc::new(AuthContext {\n"
        "        google,\n"
        "        npc_token,\n"
        "        admin_emails,\n"
        "    });\n",
        "NPC token handoff",
    )

    text = replace_once(
        text,
        "    // Start terrain REST API server. No CORS layer on purpose: browsers only\n",
        "    let embedded_websocket_addr = match listener.local_addr() {\n"
        "        Ok(addr) => addr,\n"
        "        Err(e) => {\n"
        "            error!(\"Failed to read game listener address: {}\", e);\n"
        "            return ExitCode::FAILURE;\n"
        "        }\n"
        "    };\n\n"
        "    // Start terrain REST API server. No CORS layer on purpose: browsers only\n",
        "WebSocket readiness address",
    )

    text = replace_once(
        text,
        "    let mut api_task = JoinSet::new();\n    match TcpListener::bind(&terrain_addr).await {\n",
        "    let mut api_task = JoinSet::new();\n"
        "    let mut embedded_api_addr = None;\n"
        "    match TcpListener::bind(&terrain_addr).await {\n",
        "API readiness slot",
    )

    text = replace_once(
        text,
        "        Ok(terrain_listener) => {\n            info!(\"Terrain REST API listening on: {}\", terrain_addr);\n",
        "        Ok(terrain_listener) => {\n"
        "            embedded_api_addr = terrain_listener.local_addr().ok();\n"
        "            info!(\"Terrain REST API listening on: {}\", terrain_addr);\n",
        "API listener address",
    )

    text = replace_once(
        text,
        "    info!(\"🎮 MMORPG Server started successfully!\");\n",
        "    let embedded_api_addr = match embedded_api_addr {\n"
        "        Some(addr) => addr,\n"
        "        None => {\n"
        "            error!(\"Failed to read terrain API listener address\");\n"
        "            return ExitCode::FAILURE;\n"
        "        }\n"
        "    };\n"
        "    let _ = ready_tx.send(EmbeddedServerReady {\n"
        "        websocket_addr: embedded_websocket_addr,\n"
        "        api_addr: embedded_api_addr,\n"
        "        npc_token: embedded_npc_token,\n"
        "    });\n\n"
        "    info!(\"🎮 MMORPG Server started successfully!\");\n",
        "readiness handoff",
    )

    text = replace_once(
        text,
        "    let signal = shutdown_signal();\n    tokio::pin!(signal);\n",
        "    let signal = async move {\n"
        "        let _ = external_shutdown.await;\n"
        "    };\n"
        "    tokio::pin!(signal);\n",
        "external shutdown",
    )

    banner = (
        "// GENERATED FOR TAURIN4 M3-D FROM PINNED OPENMMO SERVER MAIN.\n"
        f"// Source pin: {PIN}\n"
        "// Do not hand-edit; authoritative modules remain the pinned upstream files.\n\n"
    )
    lib_rs.write_text(banner + text, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--openmmo", required=True, type=Path)
    args = parser.parse_args()

    server_src = args.openmmo / "server" / "src"
    main_rs = server_src / "main.rs"
    lib_rs = server_src / "lib.rs"
    if not main_rs.is_file():
        raise SystemExit(f"missing pinned server main.rs: {main_rs}")

    generate(main_rs, lib_rs)
    print(f"generated {lib_rs} from OpenMMO pin {PIN}")


if __name__ == "__main__":
    main()
