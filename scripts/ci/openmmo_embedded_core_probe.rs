use onlinerpg_server::run_embedded_server;
use std::{path::{Path, PathBuf}, process::ExitCode, time::Duration};
use tokio::sync::oneshot;
use tokio::time::timeout;
use tokio_tungstenite::connect_async;

fn path_arg(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

async fn run_cycle(root: &Path) -> String {
    let state_dir = root.join("state");
    let terrain_dir = root.join("terrain");
    let npc_dir = root.join("npcs");
    let tales_dir = root.join("tales");
    let geoip_dir = root.join("geoip");
    for dir in [&state_dir, &terrain_dir, &npc_dir, &tales_dir, &geoip_dir] {
        std::fs::create_dir_all(dir).expect("create probe directory");
    }

    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let (ready_tx, ready_rx) = oneshot::channel();
    let args = vec![
        "onlinerpg-server-embedded-probe".to_string(),
        "--bind".to_string(),
        "127.0.0.1".to_string(),
        "--port".to_string(),
        "0".to_string(),
        "--api-bind".to_string(),
        "127.0.0.1".to_string(),
        "--terrain-port".to_string(),
        "0".to_string(),
        "--state-dir".to_string(),
        path_arg(&state_dir),
        "--terrain-dir".to_string(),
        path_arg(&terrain_dir),
        "--npc-data-dir".to_string(),
        path_arg(&npc_dir),
        "--tales-ledger".to_string(),
        path_arg(&tales_dir.join("ledger.txt")),
        "--geoip-db".to_string(),
        path_arg(&geoip_dir.join("missing.csv")),
    ];

    let server_task = tokio::spawn(run_embedded_server(args, shutdown_rx, ready_tx));
    let ready = timeout(Duration::from_secs(30), ready_rx)
        .await
        .expect("embedded OpenMMO readiness timeout")
        .expect("embedded OpenMMO readiness channel closed");

    assert!(ready.websocket_addr.ip().is_loopback());
    assert!(ready.websocket_addr.port() > 0);
    assert!(ready.api_addr.ip().is_loopback());
    assert!(ready.api_addr.port() > 0);
    assert!(ready.npc_token.len() >= 16);

    let ws_url = format!("ws://{}", ready.websocket_addr);
    let (_socket, response) = timeout(Duration::from_secs(10), connect_async(&ws_url))
        .await
        .expect("WebSocket connect timeout")
        .expect("WebSocket upgrade against embedded OpenMMO");
    assert_eq!(response.status().as_u16(), 101);

    let token_path = state_dir.join("npc_token");
    let token_on_disk = std::fs::read_to_string(&token_path)
        .expect("read generated NPC token")
        .trim()
        .to_string();
    assert_eq!(token_on_disk, ready.npc_token);

    shutdown_tx.send(()).expect("request embedded OpenMMO shutdown");
    let exit = timeout(Duration::from_secs(30), server_task)
        .await
        .expect("embedded OpenMMO shutdown timeout")
        .expect("embedded OpenMMO task join");
    assert_eq!(exit, ExitCode::SUCCESS);

    assert!(state_dir.join("game_data.db").is_file());
    token_on_disk
}

#[tokio::main]
async fn main() {
    let root = std::env::var_os("OPENMMO_EMBEDDED_PROBE_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir().join("taurin4-openmmo-embedded-core-probe"));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).expect("create probe root");

    let first_token = run_cycle(&root).await;
    let second_token = run_cycle(&root).await;
    assert_eq!(first_token, second_token, "NPC auth token must persist across restart");

    println!("M3-D Slice 1B embedded authoritative OpenMMO core probe: PASS");
    println!("state_root={}", root.display());
}
