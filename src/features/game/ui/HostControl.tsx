import { useEffect, useState } from "react";
import {
  getHostStatus,
  isTauriRuntime,
  startHost,
  stopHost,
  type HostSnapshot,
} from "../../../platform/hostRuntime";

const EMPTY: HostSnapshot = {
  running: false,
  hostName: "taurin4 host",
  bindAddress: null,
  port: null,
  lanVisible: false,
  connectedClients: 0,
  protocolVersion: 1,
  lastError: null,
};

export function HostControl() {
  const [status, setStatus] = useState<HostSnapshot>(EMPTY);
  const [busy, setBusy] = useState(false);
  const nativeRuntime = isTauriRuntime();

  useEffect(() => {
    let disposed = false;

    const refresh = async () => {
      const next = await getHostStatus();
      if (!disposed) setStatus(next);
    };

    void refresh();

    if (!nativeRuntime) {
      return () => {
        disposed = true;
      };
    }

    const timer = window.setInterval(() => void refresh(), 1500);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [nativeRuntime]);

  const start = async (lanVisible: boolean) => {
    setBusy(true);
    try {
      setStatus(
        await startHost({
          hostName: "idea2 host",
          port: 10006,
          lanVisible,
        }),
      );
    } catch (error) {
      setStatus((current) => ({
        ...current,
        lastError: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      setStatus(await stopHost());
    } catch (error) {
      setStatus((current) => ({
        ...current,
        lastError: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="host-control" aria-label="LAN host controls">
      <div className="host-control__summary">
        <div>
          <p className="eyebrow">GAME HOST</p>
          <strong>
            {!nativeRuntime
              ? "WEB PREVIEW"
              : status.running
                ? status.lanVisible
                  ? "LAN HOST ONLINE"
                  : "LOCAL HOST ONLINE"
                : "HOST OFFLINE"}
          </strong>
        </div>

        <div className="host-control__meta">
          {status.running ? (
            <>
              <span>
                {status.bindAddress}:{status.port}
              </span>
              <span>{status.connectedClients} CLIENTS</span>
              <span>PROTO {status.protocolVersion}</span>
            </>
          ) : (
            <span>
              {nativeRuntime
                ? "Windows / Android common Rust core"
                : "Host controls activate inside Tauri"}
            </span>
          )}
        </div>
      </div>

      <div className="host-control__actions">
        {status.running ? (
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => void stop()}
          >
            Host 종료
          </button>
        ) : (
          <>
            <button
              className="text-button"
              type="button"
              disabled={!nativeRuntime || busy}
              onClick={() => void start(false)}
            >
              Local Host
            </button>
            <button
              className="text-button text-button--accent"
              type="button"
              disabled={!nativeRuntime || busy}
              onClick={() => void start(true)}
            >
              LAN Host
            </button>
          </>
        )}
      </div>

      {status.lastError ? (
        <p className="host-control__error">{status.lastError}</p>
      ) : null}
    </section>
  );
}
