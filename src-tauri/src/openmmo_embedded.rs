use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager};

#[cfg(feature = "embedded-openmmo")]
use std::{
    process::ExitCode,
    sync::mpsc,
    thread,
    time::Duration,
};

pub const OPENMMO_PINNED_COMMIT: &str = "950e081c178d920c10c51f2d31f60c1b3383c925";
const EMBEDDED_ACCOUNT: &str = "npc_idea2_player";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum OpenMmoEmbeddedPhase {
    Idle,
    Prepared,
    Starting,
    Running,
    Stopping,
    Failed,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OpenMmoEmbeddedPaths {
    pub root_dir: String,
    pub state_dir: String,
    pub terrain_dir: String,
    pub npc_data_dir: String,
    pub tales_ledger: String,
    pub geoip_db: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OpenMmoEmbeddedSnapshot {
    pub phase: OpenMmoEmbeddedPhase,
    pub pinned_commit: &'static str,
    pub core_linked: bool,
    pub server_url: Option<String>,
    pub api_url: Option<String>,
    pub paths: Option<OpenMmoEmbeddedPaths>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OpenMmoEmbeddedLaunchConfig {
    pub server_url: String,
    pub account_name: String,
    pub npc_token: String,
    pub autostart: bool,
}

#[cfg(feature = "embedded-openmmo")]
struct EmbeddedWorker {
    shutdown: Option<tokio::sync::oneshot::Sender<()>>,
    done: mpsc::Receiver<Result<(), String>>,
    thread: Option<thread::JoinHandle<()>>,
}

struct OpenMmoEmbeddedState {
    phase: OpenMmoEmbeddedPhase,
    paths: Option<OpenMmoEmbeddedPaths>,
    core_linked: bool,
    server_url: Option<String>,
    api_url: Option<String>,
    npc_token: Option<String>,
    #[cfg(feature = "embedded-openmmo")]
    worker: Option<EmbeddedWorker>,
    last_error: Option<String>,
}

impl Default for OpenMmoEmbeddedState {
    fn default() -> Self {
        Self {
            phase: OpenMmoEmbeddedPhase::Idle,
            paths: None,
            core_linked: false,
            server_url: None,
            api_url: None,
            npc_token: None,
            #[cfg(feature = "embedded-openmmo")]
            worker: None,
            last_error: None,
        }
    }
}

pub struct OpenMmoEmbeddedController {
    state: Mutex<OpenMmoEmbeddedState>,
}

impl Default for OpenMmoEmbeddedController {
    fn default() -> Self {
        Self::new()
    }
}

impl OpenMmoEmbeddedController {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(OpenMmoEmbeddedState::default()),
        }
    }

    pub fn snapshot(&self) -> OpenMmoEmbeddedSnapshot {
        let state = self.state.lock().expect("embedded OpenMMO state lock");
        snapshot_from_state(&state)
    }

    pub fn prepare(&self, app: &AppHandle) -> Result<OpenMmoEmbeddedSnapshot, String> {
        let root = embedded_root(app)?;
        self.prepare_at(root)
    }

    pub fn start(&self, app: &AppHandle) -> Result<OpenMmoEmbeddedLaunchConfig, String> {
        let root = embedded_root(app)?;
        self.start_at(root)
    }

    fn prepare_at(&self, root: PathBuf) -> Result<OpenMmoEmbeddedSnapshot, String> {
        #[cfg(feature = "embedded-openmmo")]
        {
            let state = self.state.lock().expect("embedded OpenMMO state lock");
            if state.worker.is_some() {
                return Err("embedded OpenMMO is already running".into());
            }
        }

        match prepare_paths(&root) {
            Ok(paths) => {
                let mut state = self.state.lock().expect("embedded OpenMMO state lock");
                state.phase = OpenMmoEmbeddedPhase::Prepared;
                state.paths = Some(paths);
                state.core_linked = false;
                state.server_url = None;
                state.api_url = None;
                state.npc_token = None;
                state.last_error = None;
                Ok(snapshot_from_state(&state))
            }
            Err(error) => {
                self.mark_failed(error.clone());
                Err(error)
            }
        }
    }

    #[cfg(not(feature = "embedded-openmmo"))]
    fn start_at(&self, root: PathBuf) -> Result<OpenMmoEmbeddedLaunchConfig, String> {
        let _ = self.prepare_at(root)?;
        let error = "embedded OpenMMO core is not linked in this build; enable the embedded-openmmo feature".to_string();
        self.mark_failed(error.clone());
        Err(error)
    }

    #[cfg(feature = "embedded-openmmo")]
    fn start_at(&self, root: PathBuf) -> Result<OpenMmoEmbeddedLaunchConfig, String> {
        let paths = prepare_paths(&root).map_err(|error| {
            self.mark_failed(error.clone());
            error
        })?;

        {
            let mut state = self.state.lock().expect("embedded OpenMMO state lock");
            if state.worker.is_some() || matches!(state.phase, OpenMmoEmbeddedPhase::Starting | OpenMmoEmbeddedPhase::Running | OpenMmoEmbeddedPhase::Stopping) {
                return Err("embedded OpenMMO is already active".into());
            }
            state.phase = OpenMmoEmbeddedPhase::Starting;
            state.paths = Some(paths.clone());
            state.core_linked = false;
            state.server_url = None;
            state.api_url = None;
            state.npc_token = None;
            state.last_error = None;
        }

        let args = embedded_args(&paths);
        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        let (upstream_ready_tx, upstream_ready_rx) = tokio::sync::oneshot::channel();
        let (ready_tx, ready_rx) = mpsc::sync_channel::<Result<WorkerReady, String>>(1);
        let ready_error_tx = ready_tx.clone();
        let (done_tx, done_rx) = mpsc::sync_channel::<Result<(), String>>(1);

        let worker_thread = thread::Builder::new()
            .name("taurin4-openmmo-authoritative".into())
            .spawn(move || {
                let result = match tokio::runtime::Builder::new_multi_thread()
                    .enable_all()
                    .thread_name("taurin4-openmmo-tokio")
                    .build()
                {
                    Ok(runtime) => runtime.block_on(async move {
                        let server_task = tokio::spawn(onlinerpg_server::run_embedded_server(
                            args,
                            shutdown_rx,
                            upstream_ready_tx,
                        ));

                        let ready = tokio::time::timeout(
                            Duration::from_secs(30),
                            upstream_ready_rx,
                        )
                        .await
                        .map_err(|_| "embedded OpenMMO readiness timed out".to_string())?
                        .map_err(|_| "embedded OpenMMO readiness channel closed".to_string())?;

                        let worker_ready = WorkerReady {
                            server_url: format!("ws://{}", ready.websocket_addr),
                            api_url: format!("http://{}", ready.api_addr),
                            npc_token: ready.npc_token,
                        };
                        ready_tx
                            .send(Ok(worker_ready))
                            .map_err(|_| "embedded OpenMMO readiness receiver dropped".to_string())?;

                        let exit = server_task
                            .await
                            .map_err(|error| format!("embedded OpenMMO task failed: {error}"))?;
                        if exit != ExitCode::SUCCESS {
                            return Err("embedded OpenMMO exited unsuccessfully".into());
                        }
                        Ok(())
                    }),
                    Err(error) => Err(format!("create embedded OpenMMO Tokio runtime: {error}")),
                };

                if let Err(error) = &result {
                    let _ = ready_error_tx.send(Err(error.clone()));
                }
                let _ = done_tx.send(result);
            })
            .map_err(|error| {
                let message = format!("spawn embedded OpenMMO thread: {error}");
                self.mark_failed(message.clone());
                message
            })?;

        let ready = match ready_rx.recv_timeout(Duration::from_secs(35)) {
            Ok(Ok(ready)) => ready,
            Ok(Err(error)) => {
                let _ = shutdown_tx.send(());
                let _ = done_rx.recv_timeout(Duration::from_secs(5));
                let _ = worker_thread.join();
                self.mark_failed(error.clone());
                return Err(error);
            }
            Err(error) => {
                let message = format!("wait for embedded OpenMMO readiness: {error}");
                let _ = shutdown_tx.send(());
                let _ = done_rx.recv_timeout(Duration::from_secs(5));
                let _ = worker_thread.join();
                self.mark_failed(message.clone());
                return Err(message);
            }
        };

        let launch = OpenMmoEmbeddedLaunchConfig {
            server_url: ready.server_url.clone(),
            account_name: EMBEDDED_ACCOUNT.into(),
            npc_token: ready.npc_token.clone(),
            autostart: true,
        };

        let mut state = self.state.lock().expect("embedded OpenMMO state lock");
        state.phase = OpenMmoEmbeddedPhase::Running;
        state.core_linked = true;
        state.server_url = Some(ready.server_url);
        state.api_url = Some(ready.api_url);
        state.npc_token = Some(ready.npc_token);
        state.worker = Some(EmbeddedWorker {
            shutdown: Some(shutdown_tx),
            done: done_rx,
            thread: Some(worker_thread),
        });
        state.last_error = None;
        Ok(launch)
    }

    pub fn stop(&self) -> Result<OpenMmoEmbeddedSnapshot, String> {
        #[cfg(not(feature = "embedded-openmmo"))]
        {
            let mut state = self.state.lock().expect("embedded OpenMMO state lock");
            state.phase = OpenMmoEmbeddedPhase::Idle;
            state.core_linked = false;
            state.server_url = None;
            state.api_url = None;
            state.npc_token = None;
            state.last_error = None;
            return Ok(snapshot_from_state(&state));
        }

        #[cfg(feature = "embedded-openmmo")]
        {
            let mut worker = {
                let mut state = self.state.lock().expect("embedded OpenMMO state lock");
                let Some(worker) = state.worker.take() else {
                    state.phase = OpenMmoEmbeddedPhase::Idle;
                    state.core_linked = false;
                    state.server_url = None;
                    state.api_url = None;
                    state.npc_token = None;
                    state.last_error = None;
                    return Ok(snapshot_from_state(&state));
                };
                state.phase = OpenMmoEmbeddedPhase::Stopping;
                state.core_linked = false;
                state.server_url = None;
                state.api_url = None;
                state.npc_token = None;
                worker
            };

            if let Some(shutdown) = worker.shutdown.take() {
                let _ = shutdown.send(());
            }

            let result = worker
                .done
                .recv_timeout(Duration::from_secs(40))
                .map_err(|error| format!("wait for embedded OpenMMO shutdown: {error}"))?;

            if let Some(handle) = worker.thread.take() {
                handle
                    .join()
                    .map_err(|_| "embedded OpenMMO thread panicked".to_string())?;
            }

            match result {
                Ok(()) => {
                    let mut state = self.state.lock().expect("embedded OpenMMO state lock");
                    state.phase = OpenMmoEmbeddedPhase::Idle;
                    state.last_error = None;
                    Ok(snapshot_from_state(&state))
                }
                Err(error) => {
                    self.mark_failed(error.clone());
                    Err(error)
                }
            }
        }
    }

    fn mark_failed(&self, error: String) {
        let mut state = self.state.lock().expect("embedded OpenMMO state lock");
        state.phase = OpenMmoEmbeddedPhase::Failed;
        state.core_linked = false;
        state.server_url = None;
        state.api_url = None;
        state.npc_token = None;
        state.last_error = Some(error);
    }
}

#[cfg(feature = "embedded-openmmo")]
struct WorkerReady {
    server_url: String,
    api_url: String,
    npc_token: String,
}

fn embedded_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map_err(|error| format!("resolve app-local data directory: {error}"))
        .map(|path| path.join("openmmo"))
}

fn snapshot_from_state(state: &OpenMmoEmbeddedState) -> OpenMmoEmbeddedSnapshot {
    OpenMmoEmbeddedSnapshot {
        phase: state.phase.clone(),
        pinned_commit: OPENMMO_PINNED_COMMIT,
        core_linked: state.core_linked,
        server_url: state.server_url.clone(),
        api_url: state.api_url.clone(),
        paths: state.paths.clone(),
        last_error: state.last_error.clone(),
    }
}

fn prepare_paths(root: &Path) -> Result<OpenMmoEmbeddedPaths, String> {
    let state_dir = root.join("state");
    let terrain_dir = root.join("data").join("terrain");
    let npc_data_dir = root.join("agent-client").join("data").join("npcs");
    let tales_dir = root.join("agent-client").join("data").join("tales");
    let geoip_dir = root.join("data").join("geoip");

    for directory in [
        &state_dir,
        &terrain_dir,
        &npc_data_dir,
        &tales_dir,
        &geoip_dir,
    ] {
        fs::create_dir_all(directory)
            .map_err(|error| format!("create {}: {error}", directory.display()))?;
    }

    Ok(OpenMmoEmbeddedPaths {
        root_dir: path_string(root),
        state_dir: path_string(&state_dir),
        terrain_dir: path_string(&terrain_dir),
        npc_data_dir: path_string(&npc_data_dir),
        tales_ledger: path_string(&tales_dir.join("ledger.txt")),
        geoip_db: path_string(&geoip_dir.join("dbip-country-lite.csv")),
    })
}

#[cfg(feature = "embedded-openmmo")]
fn embedded_args(paths: &OpenMmoEmbeddedPaths) -> Vec<String> {
    vec![
        "taurin4-embedded-openmmo".into(),
        "--bind".into(),
        "127.0.0.1".into(),
        "--port".into(),
        "0".into(),
        "--api-bind".into(),
        "127.0.0.1".into(),
        "--terrain-port".into(),
        "0".into(),
        "--state-dir".into(),
        paths.state_dir.clone(),
        "--terrain-dir".into(),
        paths.terrain_dir.clone(),
        "--npc-data-dir".into(),
        paths.npc_data_dir.clone(),
        "--tales-ledger".into(),
        paths.tales_ledger.clone(),
        "--geoip-db".into(),
        paths.geoip_db.clone(),
    ]
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_test_root() -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("taurin4-openmmo-embedded-{nonce}"))
    }

    #[test]
    fn prepare_creates_openmmo_app_private_layout_without_claiming_core_is_linked() {
        let root = unique_test_root();
        let controller = OpenMmoEmbeddedController::new();

        let snapshot = controller.prepare_at(root.clone()).expect("prepare");

        assert_eq!(snapshot.phase, OpenMmoEmbeddedPhase::Prepared);
        assert_eq!(snapshot.pinned_commit, OPENMMO_PINNED_COMMIT);
        assert!(!snapshot.core_linked);

        let paths = snapshot.paths.expect("prepared paths");
        assert!(Path::new(&paths.state_dir).is_dir());
        assert!(Path::new(&paths.terrain_dir).is_dir());
        assert!(Path::new(&paths.npc_data_dir).is_dir());
        assert!(Path::new(&paths.tales_ledger)
            .parent()
            .is_some_and(Path::is_dir));
        assert!(Path::new(&paths.geoip_db)
            .parent()
            .is_some_and(Path::is_dir));

        let stopped = controller.stop().expect("stop prepared controller");
        assert_eq!(stopped.phase, OpenMmoEmbeddedPhase::Idle);
        assert!(root.exists(), "stop must not delete persistent state root");

        fs::remove_dir_all(root).expect("clean test root");
    }

    #[cfg(feature = "embedded-openmmo")]
    #[test]
    fn real_pinned_core_starts_stops_and_reuses_persistent_token() {
        let root = unique_test_root();
        let controller = OpenMmoEmbeddedController::new();

        let first = controller.start_at(root.clone()).expect("start authoritative core");
        assert!(first.server_url.starts_with("ws://127.0.0.1:"));
        assert!(first.npc_token.len() >= 16);
        let running = controller.snapshot();
        assert_eq!(running.phase, OpenMmoEmbeddedPhase::Running);
        assert!(running.core_linked);

        let stopped = controller.stop().expect("stop authoritative core");
        assert_eq!(stopped.phase, OpenMmoEmbeddedPhase::Idle);
        assert!(!stopped.core_linked);
        assert!(root.join("state").join("game_data.db").is_file());

        let second = controller.start_at(root.clone()).expect("restart authoritative core");
        assert_eq!(first.npc_token, second.npc_token);
        controller.stop().expect("stop restarted authoritative core");

        fs::remove_dir_all(root).expect("clean test root");
    }
}
