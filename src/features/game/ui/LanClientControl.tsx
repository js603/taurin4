import { useEffect, useState, useSyncExternalStore } from "react";
import { LanClient } from "../../../network/lanClient";
import { isTauriRuntime } from "../../../platform/hostRuntime";

function statusLabel(status: string) {
  switch (status) {
    case "connecting":
      return "CONNECTING";
    case "handshaking":
      return "HANDSHAKING";
    case "connected":
      return "CONNECTED";
    case "reconnecting":
      return "RECONNECTING";
    case "error":
      return "CONNECTION ERROR";
    default:
      return "CLIENT OFFLINE";
  }
}

export function LanClientControl() {
  const [client] = useState(
    () =>
      new LanClient({
        platform:
          typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent)
            ? "android"
            : "windows",
      }),
  );
  const snapshot = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  );
  const [address, setAddress] = useState("127.0.0.1:10006");
  const [inputError, setInputError] = useState<string | null>(null);
  const nativeRuntime = isTauriRuntime();

  useEffect(() => {
    return () => client.disconnect();
  }, [client]);

  const connect = () => {
    setInputError(null);
    try {
      client.connect(address);
    } catch (error) {
      setInputError(error instanceof Error ? error.message : String(error));
    }
  };

  const connected = snapshot.status === "connected";
  const active =
    snapshot.status === "connecting" ||
    snapshot.status === "handshaking" ||
    snapshot.status === "connected" ||
    snapshot.status === "reconnecting";

  return (
    <section className="lan-client" aria-label="LAN client controls">
      <div className="lan-client__summary">
        <div>
          <p className="eyebrow">LAN CLIENT</p>
          <strong>{nativeRuntime ? statusLabel(snapshot.status) : "WEB PREVIEW"}</strong>
        </div>

        <div className="lan-client__meta">
          {snapshot.hostName ? <span>HOST {snapshot.hostName}</span> : null}
          {snapshot.latencyMs !== null ? (
            <span>PING {snapshot.latencyMs}ms</span>
          ) : null}
          {snapshot.reconnectAttempt > 0 ? (
            <span>RETRY {snapshot.reconnectAttempt}</span>
          ) : null}
        </div>
      </div>

      <div className="lan-client__connection">
        <label>
          <span>HOST ADDRESS</span>
          <input
            type="text"
            value={address}
            disabled={!nativeRuntime || active}
            onChange={(event) => setAddress(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && nativeRuntime && !active) {
                connect();
              }
            }}
            placeholder="192.168.0.15:10006"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
          />
        </label>

        <div className="lan-client__actions">
          {active ? (
            <>
              <button
                type="button"
                className="text-button"
                disabled={!connected}
                onClick={() => client.ping()}
              >
                Ping
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => client.disconnect()}
              >
                연결 해제
              </button>
            </>
          ) : (
            <button
              type="button"
              className="text-button text-button--accent"
              disabled={!nativeRuntime}
              onClick={connect}
            >
              연결
            </button>
          )}
        </div>
      </div>

      <div className="lan-client__detail">
        {snapshot.endpoint ? <span>{snapshot.endpoint}</span> : null}
        {!nativeRuntime ? (
          <span>Windows Tauri 앱에서 PC↔PC LAN 연결을 검증합니다.</span>
        ) : null}
      </div>

      {inputError || snapshot.lastError ? (
        <p className="host-control__error">
          {inputError ?? snapshot.lastError}
        </p>
      ) : null}
    </section>
  );
}
