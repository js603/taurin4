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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(HostController::new())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![host_status, host_start, host_stop])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
