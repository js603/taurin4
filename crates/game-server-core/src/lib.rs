use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::{
    net::SocketAddr,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        mpsc,
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::Duration,
};
use taurin4_game_network::{
    decode_client_message, encode_server_message, ClientControlMessage, ServerControlMessage,
    LAN_PROTOCOL_VERSION,
};
use thiserror::Error;
use tokio::{net::TcpListener, sync::oneshot};
use tokio_tungstenite::{accept_async, tungstenite::Message};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostConfig {
    pub host_name: String,
    pub port: u16,
    pub lan_visible: bool,
}

impl Default for HostConfig {
    fn default() -> Self {
        Self {
            host_name: "taurin4 host".into(),
            port: 10_006,
            lan_visible: false,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostSnapshot {
    pub running: bool,
    pub host_name: String,
    pub bind_address: Option<String>,
    pub port: Option<u16>,
    pub lan_visible: bool,
    pub connected_clients: usize,
    pub protocol_version: u32,
    pub last_error: Option<String>,
}

#[derive(Debug, Error)]
pub enum HostError {
    #[error("game host is already running")]
    AlreadyRunning,
    #[error("failed to start game host: {0}")]
    StartFailed(String),
    #[error("game host startup timed out")]
    StartupTimedOut,
    #[error("game host thread failed")]
    WorkerFailed,
}

#[derive(Debug)]
struct SharedStatus {
    running: AtomicBool,
    connected_clients: AtomicUsize,
    host_name: Mutex<String>,
    bind_address: Mutex<Option<String>>,
    port: Mutex<Option<u16>>,
    lan_visible: AtomicBool,
    last_error: Mutex<Option<String>>,
}

impl Default for SharedStatus {
    fn default() -> Self {
        Self {
            running: AtomicBool::new(false),
            connected_clients: AtomicUsize::new(0),
            host_name: Mutex::new("taurin4 host".into()),
            bind_address: Mutex::new(None),
            port: Mutex::new(None),
            lan_visible: AtomicBool::new(false),
            last_error: Mutex::new(None),
        }
    }
}

impl SharedStatus {
    fn snapshot(&self) -> HostSnapshot {
        HostSnapshot {
            running: self.running.load(Ordering::SeqCst),
            host_name: self.host_name.lock().expect("host name lock").clone(),
            bind_address: self
                .bind_address
                .lock()
                .expect("bind address lock")
                .clone(),
            port: *self.port.lock().expect("port lock"),
            lan_visible: self.lan_visible.load(Ordering::SeqCst),
            connected_clients: self.connected_clients.load(Ordering::SeqCst),
            protocol_version: LAN_PROTOCOL_VERSION,
            last_error: self.last_error.lock().expect("error lock").clone(),
        }
    }

    fn reset_for_start(&self, config: &HostConfig) {
        self.running.store(false, Ordering::SeqCst);
        self.connected_clients.store(0, Ordering::SeqCst);
        *self.host_name.lock().expect("host name lock") = config.host_name.clone();
        *self.bind_address.lock().expect("bind address lock") = None;
        *self.port.lock().expect("port lock") = None;
        self.lan_visible.store(config.lan_visible, Ordering::SeqCst);
        *self.last_error.lock().expect("error lock") = None;
    }

    fn mark_running(&self, addr: SocketAddr) {
        *self.bind_address.lock().expect("bind address lock") = Some(addr.ip().to_string());
        *self.port.lock().expect("port lock") = Some(addr.port());
        self.running.store(true, Ordering::SeqCst);
    }

    fn mark_stopped(&self) {
        self.running.store(false, Ordering::SeqCst);
        self.connected_clients.store(0, Ordering::SeqCst);
    }

    fn set_error(&self, message: impl Into<String>) {
        *self.last_error.lock().expect("error lock") = Some(message.into());
    }
}

pub struct HostController {
    status: Arc<SharedStatus>,
    worker: Mutex<Option<JoinHandle<()>>>,
    shutdown: Mutex<Option<oneshot::Sender<()>>>,
}

impl Default for HostController {
    fn default() -> Self {
        Self::new()
    }
}

impl HostController {
    pub fn new() -> Self {
        Self {
            status: Arc::new(SharedStatus::default()),
            worker: Mutex::new(None),
            shutdown: Mutex::new(None),
        }
    }

    pub fn snapshot(&self) -> HostSnapshot {
        self.status.snapshot()
    }

    pub fn start(&self, config: HostConfig) -> Result<HostSnapshot, HostError> {
        self.reap_finished_worker();

        if self.status.running.load(Ordering::SeqCst) {
            return Err(HostError::AlreadyRunning);
        }

        self.status.reset_for_start(&config);

        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
        let (ready_tx, ready_rx) = mpsc::sync_channel::<Result<SocketAddr, String>>(1);
        let status = Arc::clone(&self.status);
        let worker_config = config.clone();

        let worker = thread::Builder::new()
            .name("taurin4-game-host".into())
            .spawn(move || {
                let runtime = match tokio::runtime::Builder::new_current_thread()
                    .enable_io()
                    .enable_time()
                    .build()
                {
                    Ok(runtime) => runtime,
                    Err(error) => {
                        let message = format!("tokio runtime: {error}");
                        status.set_error(message.clone());
                        let _ = ready_tx.send(Err(message));
                        return;
                    }
                };

                runtime.block_on(run_host(
                    worker_config,
                    shutdown_rx,
                    ready_tx,
                    Arc::clone(&status),
                ));
                status.mark_stopped();
            })
            .map_err(|error| HostError::StartFailed(error.to_string()))?;

        *self.worker.lock().expect("worker lock") = Some(worker);
        *self.shutdown.lock().expect("shutdown lock") = Some(shutdown_tx);

        match ready_rx.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(_)) => Ok(self.snapshot()),
            Ok(Err(message)) => {
                self.finish_failed_start();
                Err(HostError::StartFailed(message))
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                let _ = self.stop();
                Err(HostError::StartupTimedOut)
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                self.finish_failed_start();
                Err(HostError::WorkerFailed)
            }
        }
    }

    pub fn stop(&self) -> Result<HostSnapshot, HostError> {
        if let Some(sender) = self.shutdown.lock().expect("shutdown lock").take() {
            let _ = sender.send(());
        }

        if let Some(worker) = self.worker.lock().expect("worker lock").take() {
            if worker.join().is_err() {
                self.status.set_error("game host thread panicked");
                self.status.mark_stopped();
                return Err(HostError::WorkerFailed);
            }
        }

        self.status.mark_stopped();
        Ok(self.snapshot())
    }

    fn finish_failed_start(&self) {
        self.shutdown.lock().expect("shutdown lock").take();
        if let Some(worker) = self.worker.lock().expect("worker lock").take() {
            let _ = worker.join();
        }
        self.status.mark_stopped();
    }

    fn reap_finished_worker(&self) {
        let mut worker = self.worker.lock().expect("worker lock");
        if worker.as_ref().is_some_and(JoinHandle::is_finished) {
            if let Some(finished) = worker.take() {
                let _ = finished.join();
            }
            self.shutdown.lock().expect("shutdown lock").take();
            self.status.mark_stopped();
        }
    }
}

impl Drop for HostController {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

async fn run_host(
    config: HostConfig,
    mut shutdown: oneshot::Receiver<()>,
    ready: mpsc::SyncSender<Result<SocketAddr, String>>,
    status: Arc<SharedStatus>,
) {
    let bind_ip = if config.lan_visible {
        "0.0.0.0"
    } else {
        "127.0.0.1"
    };
    let bind_target = format!("{bind_ip}:{}", config.port);

    let listener = match TcpListener::bind(&bind_target).await {
        Ok(listener) => listener,
        Err(error) => {
            let message = format!("bind {bind_target}: {error}");
            status.set_error(message.clone());
            let _ = ready.send(Err(message));
            return;
        }
    };

    let local_addr = match listener.local_addr() {
        Ok(addr) => addr,
        Err(error) => {
            let message = format!("read local address: {error}");
            status.set_error(message.clone());
            let _ = ready.send(Err(message));
            return;
        }
    };

    status.mark_running(local_addr);
    if ready.send(Ok(local_addr)).is_err() {
        return;
    }

    loop {
        tokio::select! {
            _ = &mut shutdown => break,
            accepted = listener.accept() => {
                match accepted {
                    Ok((stream, _peer)) => {
                        let connection_status = Arc::clone(&status);
                        let host_name = config.host_name.clone();
                        tokio::spawn(async move {
                            if let Err(error) = handle_connection(
                                stream,
                                host_name,
                                Arc::clone(&connection_status),
                            )
                            .await
                            {
                                connection_status
                                    .set_error(format!("client connection: {error}"));
                            }
                        });
                    }
                    Err(error) => {
                        status.set_error(format!("accept connection: {error}"));
                    }
                }
            }
        }
    }
}

async fn handle_connection(
    stream: tokio::net::TcpStream,
    host_name: String,
    status: Arc<SharedStatus>,
) -> Result<(), String> {
    let mut socket = accept_async(stream)
        .await
        .map_err(|error| error.to_string())?;

    status.connected_clients.fetch_add(1, Ordering::SeqCst);
    let _guard = ClientCountGuard(Arc::clone(&status));

    send_control(
        &mut socket,
        &ServerControlMessage::HostHello {
            protocol_version: LAN_PROTOCOL_VERSION,
            host_name,
        },
    )
    .await?;

    while let Some(message) = socket.next().await {
        let message = message.map_err(|error| error.to_string())?;

        match message {
            Message::Text(text) => {
                let response = match decode_client_message(text.as_ref()) {
                    Ok(ClientControlMessage::Hello { client_id, .. }) => {
                        ServerControlMessage::ClientAccepted { client_id }
                    }
                    Ok(ClientControlMessage::Ping { nonce }) => {
                        ServerControlMessage::Pong { nonce }
                    }
                    Err(error) => ServerControlMessage::Error {
                        message: format!("invalid control message: {error}"),
                    },
                };
                send_control(&mut socket, &response).await?;
            }
            Message::Ping(payload) => {
                socket
                    .send(Message::Pong(payload))
                    .await
                    .map_err(|error| error.to_string())?;
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    Ok(())
}

async fn send_control(
    socket: &mut tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
    message: &ServerControlMessage,
) -> Result<(), String> {
    let encoded = encode_server_message(message).map_err(|error| error.to_string())?;
    socket
        .send(Message::Text(encoded.into()))
        .await
        .map_err(|error| error.to_string())
}

struct ClientCountGuard(Arc<SharedStatus>);

impl Drop for ClientCountGuard {
    fn drop(&mut self) {
        self.0.connected_clients.fetch_sub(1, Ordering::SeqCst);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_can_start_on_an_ephemeral_loopback_port_and_stop() {
        let controller = HostController::new();
        let started = controller
            .start(HostConfig {
                host_name: "test-host".into(),
                port: 0,
                lan_visible: false,
            })
            .expect("start host");

        assert!(started.running);
        assert_eq!(started.host_name, "test-host");
        assert_eq!(started.bind_address.as_deref(), Some("127.0.0.1"));
        assert!(started.port.is_some_and(|port| port > 0));

        let stopped = controller.stop().expect("stop host");
        assert!(!stopped.running);
        assert_eq!(stopped.connected_clients, 0);
    }
}
