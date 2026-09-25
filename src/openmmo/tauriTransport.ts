import type {
  OpenMmoTransport,
  OpenMmoTransportHandlers,
} from "./transport";

type PluginMessage =
  | { type: "Text"; data: string }
  | { type: "Binary"; data: number[] }
  | { type: "Ping"; data: number[] }
  | { type: "Pong"; data: number[] }
  | {
      type: "Close";
      data: { code: number; reason: string } | null;
    };

interface PluginWebSocket {
  addListener(listener: (message: PluginMessage) => void): () => void;
  send(message: PluginMessage | string | number[]): Promise<void>;
  disconnect(): Promise<void>;
}

type ConnectPluginSocket = (endpoint: string) => Promise<PluginWebSocket>;

async function defaultConnectPluginSocket(
  endpoint: string,
): Promise<PluginWebSocket> {
  const { default: WebSocket } = await import(
    "@tauri-apps/plugin-websocket"
  );
  return await WebSocket.connect(endpoint);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * OpenMMO transport backed by Tauri's Rust websocket plugin.
 *
 * The game/session layers remain unchanged. This class only adapts the
 * plugin's async connect/send API and tagged message format to the existing
 * OpenMmoTransport contract.
 */
export class TauriPluginOpenMmoTransport implements OpenMmoTransport {
  private socket: PluginWebSocket | null = null;
  private handlers: OpenMmoTransportHandlers | null = null;
  private removeListener: (() => void) | null = null;
  private open = false;
  private generation = 0;

  constructor(
    private readonly connectPluginSocket: ConnectPluginSocket =
      defaultConnectPluginSocket,
  ) {}

  connect(endpoint: string, handlers: OpenMmoTransportHandlers) {
    this.close(1000, "reconnect");

    const generation = ++this.generation;
    this.handlers = handlers;

    void this.connectPluginSocket(endpoint)
      .then((socket) => {
        if (generation !== this.generation) {
          void socket.disconnect();
          return;
        }

        this.socket = socket;
        this.open = true;
        this.removeListener = socket.addListener((message) => {
          if (generation !== this.generation) return;

          switch (message.type) {
            case "Binary":
              handlers.onBinary(Uint8Array.from(message.data));
              return;

            case "Close":
              this.open = false;
              this.socket = null;
              this.removeListener?.();
              this.removeListener = null;
              handlers.onClose(
                message.data?.code ?? 1000,
                message.data?.reason ?? "",
              );
              return;

            case "Text":
              handlers.onError(
                "OpenMMO server sent a non-binary frame",
              );
              return;

            case "Ping":
            case "Pong":
              return;
          }
        });

        handlers.onOpen();
      })
      .catch((error) => {
        if (generation !== this.generation) return;
        this.open = false;
        this.socket = null;
        handlers.onError(
          "OpenMMO Tauri WebSocket error: " + errorMessage(error),
        );
      });
  }

  send(bytes: Uint8Array) {
    const socket = this.socket;
    if (!this.open || !socket) return false;

    void socket.send(Array.from(bytes)).catch((error) => {
      if (socket !== this.socket) return;
      this.handlers?.onError(
        "OpenMMO Tauri WebSocket send error: " + errorMessage(error),
      );
    });
    return true;
  }

  close(code = 1000, reason = "client close") {
    const socket = this.socket;
    ++this.generation;
    this.open = false;
    this.socket = null;
    this.handlers = null;
    this.removeListener?.();
    this.removeListener = null;

    if (socket) {
      void socket
        .send({
          type: "Close",
          data: { code, reason },
        })
        .catch(() => socket.disconnect().catch(() => undefined));
    }
  }

  isOpen() {
    return this.open && this.socket !== null;
  }
}
