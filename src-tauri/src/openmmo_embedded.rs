use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager};

pub const OPENMMO_PINNED_COMMIT: &str = "950e081c178d920c10c51f2d31f60c1b3383c925";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum OpenMmoEmbeddedPhase {
    Idle,
    Prepared,
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
    pub paths: Option<OpenMmoEmbeddedPaths>,
    pub last_error: Option<String>,
}

#[derive(Debug)]
struct OpenMmoEmbeddedState {
    phase: OpenMmoEmbeddedPhase,
    paths: Option<OpenMmoEmbeddedPaths>,
    last_error: Option<String>,
}

impl Default for OpenMmoEmbeddedState {
    fn default() -> Self {
        Self {
            phase: OpenMmoEmbeddedPhase::Idle,
            paths: None,
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
        let root = app
            .path()
            .app_local_data_dir()
            .map_err(|error| format!("resolve app-local data directory: {error}"))?
            .join("openmmo");
        self.prepare_at(root)
    }

    fn prepare_at(&self, root: PathBuf) -> Result<OpenMmoEmbeddedSnapshot, String> {
        match prepare_paths(&root) {
            Ok(paths) => {
                let mut state = self.state.lock().expect("embedded OpenMMO state lock");
                state.phase = OpenMmoEmbeddedPhase::Prepared;
                state.paths = Some(paths);
                state.last_error = None;
                Ok(snapshot_from_state(&state))
            }
            Err(error) => {
                let mut state = self.state.lock().expect("embedded OpenMMO state lock");
                state.phase = OpenMmoEmbeddedPhase::Failed;
                state.paths = None;
                state.last_error = Some(error.clone());
                Err(error)
            }
        }
    }

    /// Stops native lifecycle ownership without deleting persistent OpenMMO data.
    ///
    /// Slice 1A intentionally has no authoritative worker yet; the next step
    /// replaces this prepared-only state with a real pinned OpenMMO server handle.
    pub fn stop(&self) -> OpenMmoEmbeddedSnapshot {
        let mut state = self.state.lock().expect("embedded OpenMMO state lock");
        state.phase = OpenMmoEmbeddedPhase::Idle;
        state.last_error = None;
        snapshot_from_state(&state)
    }
}

fn snapshot_from_state(state: &OpenMmoEmbeddedState) -> OpenMmoEmbeddedSnapshot {
    OpenMmoEmbeddedSnapshot {
        phase: state.phase.clone(),
        pinned_commit: OPENMMO_PINNED_COMMIT,
        core_linked: false,
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

        let stopped = controller.stop();
        assert_eq!(stopped.phase, OpenMmoEmbeddedPhase::Idle);
        assert!(root.exists(), "stop must not delete persistent state root");

        fs::remove_dir_all(root).expect("clean test root");
    }
}
