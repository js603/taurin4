use serde::Serialize;
use std::env;
use tauri::State;
use taurin4_game_server_core::{HostConfig, HostController, HostSnapshot};

#[tauri::command]
fn host_status(host: State<'_, HostController>) -> HostSnapshot {
    host.snapshot()
}

#[tauri::command]
fn host_start(
    config: HostConfig,
    host: State<'_, HostController>,
) -> Result<HostSnapshot, String> {
    host.start(config).map_err(|error| error.to_string())
}

#[tauri::command]
fn host_stop(host: State<'_, HostController>) -> Result<HostSnapshot, String> {
    host.stop().map_err(|error| error.to_string())
}


#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenMmoLocalLaunchConfig {
    server_url: String,
    account_name: String,
    npc_token: String,
    autostart: bool,
}

#[tauri::command]
fn openmmo_local_launch_config() -> Option<OpenMmoLocalLaunchConfig> {
    let npc_token = env::var("TAURIN4_OPENMMO_NPC_TOKEN").ok()?;
    if npc_token.trim().is_empty() {
        return None;
    }

    Some(OpenMmoLocalLaunchConfig {
        server_url: env::var("TAURIN4_OPENMMO_SERVER_URL")
            .unwrap_or_else(|_| "ws://127.0.0.1:10006".into()),
        account_name: env::var("TAURIN4_OPENMMO_ACCOUNT")
            .unwrap_or_else(|_| "npc_idea2_player".into()),
        npc_token,
        autostart: env::var("TAURIN4_OPENMMO_AUTOSTART")
            .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
            .unwrap_or(false),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(HostController::new())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            host_status,
            host_start,
            host_stop,
            openmmo_local_launch_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
