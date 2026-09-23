import {
  LAN_PROTOCOL_VERSION,
  decodeServerMessage,
  encodeClientMessage,
  normalizeLanEndpoint,
  type LanClientPlatform,
} from "./lanProtocol";

export type LanClientStatus =
  | "idle"
  | "connecting"
  | "handshaking"
  | "connected"
  | "reconnecting"
  | "error";

export interface LanClientSnapshot {
  status: LanClientStatus;
  endpoint: string | null;
  hostName: string | null;
  latencyMs: number | null;
  reconnectAttempt: number;
  lastError: string | null;
}

interface LanSocket {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface LanClientOptions {
  clientId?: string;
  platform?: LanClientPlatform;
  socketFactory?: (url: string) => LanSocket;
  reconnectDelaysMs?: number[];
  pingIntervalMs?: number;
  now?: () => number;
}

const INITIAL_SNAPSHOT: LanClientSnapshot = {
  status: "idle",
  endpoint: null,
  hostName: null,
  latencyMs: null,
  reconnectAttempt: 0,
  lastError: null,
};

function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "client-" + Math.random().toString(36).slice(2);
}

function defaultSocketFactory(url: string): LanSocket {
  return new WebSocket(url) as unknown as LanSocket;
}

export class LanClient {
  private snapshot: LanClientSnapshot = INITIAL_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private readonly clientId: string;
  private readonly platform: LanClientPlatform;
  private readonly socketFactory: (url: string) => LanSocket;
  private readonly reconnectDelaysMs: number[];
  private readonly pingIntervalMs: number;
  private readonly now: () => number;

  private socket: LanSocket | null = null;
  private desiredEndpoint: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;
  private manualDisconnect = false;
  private pingNonce = 0;
  private pendingPing: { nonce: number; sentAt: number } | null = null;

  constructor(options: LanClientOptions = {}) {
    this.clientId = options.clientId ?? createClientId();
    this.platform = options.platform ?? "windows";
    this.socketFactory = options.socketFactory ?? defaultSocketFactory;
    this.reconnectDelaysMs = options.reconnectDelaysMs ?? [500, 1500, 3000];
    this.pingIntervalMs = options.pingIntervalMs ?? 5000;
    this.now = options.now ?? (() => performance.now());
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  connect(input: string) {
    const endpoint = normalizeLanEndpoint(input);

    this.detachCurrentSocket();
    this.clearReconnectTimer();
    this.clearPingTimer();

    this.desiredEndpoint = endpoint;
    this.reconnectAttempt = 0;
    this.manualDisconnect = false;
    this.pendingPing = null;

    this.openSocket(false);
  }

  disconnect() {
    this.manualDisconnect = true;
    this.desiredEndpoint = null;
    this.clearReconnectTimer();
    this.clearPingTimer();
    this.pendingPing = null;
    this.detachCurrentSocket();
    this.reconnectAttempt = 0;
    this.update({
      status: "idle",
      endpoint: null,
      hostName: null,
      latencyMs: null,
      reconnectAttempt: 0,
      lastError: null,
    });
  }

  ping() {
    if (this.snapshot.status !== "connected" || !this.socket) {
      return false;
    }

    const nonce = ++this.pingNonce;
    this.pendingPing = {
      nonce,
      sentAt: this.now(),
    };
    this.socket.send(
      encodeClientMessage({
        type: "ping",
        nonce,
      }),
    );
    return true;
  }

  private openSocket(reconnecting: boolean) {
    const endpoint = this.desiredEndpoint;
    if (!endpoint) return;

    let socket: LanSocket;
    try {
      socket = this.socketFactory(endpoint);
    } catch (error) {
      this.update({
        status: "error",
        endpoint,
        hostName: null,
        latencyMs: null,
        reconnectAttempt: this.reconnectAttempt,
        lastError: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    this.socket = socket;
    this.update({
      status: reconnecting ? "reconnecting" : "connecting",
      endpoint,
      hostName: reconnecting ? this.snapshot.hostName : null,
      latencyMs: null,
      reconnectAttempt: this.reconnectAttempt,
      lastError: null,
    });

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.update({
        ...this.snapshot,
        status: "handshaking",
        lastError: null,
      });
    };

    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      if (typeof event.data !== "string") {
        this.failConnection("LAN host sent a non-text control message", false);
        return;
      }

      let message;
      try {
        message = decodeServerMessage(event.data);
      } catch (error) {
        this.failConnection(
          error instanceof Error ? error.message : String(error),
          false,
        );
        return;
      }

      if (message.type === "host_hello") {
        if (message.protocol_version !== LAN_PROTOCOL_VERSION) {
          this.failConnection(
            "LAN protocol mismatch: host=" +
              message.protocol_version +
              ", client=" +
              LAN_PROTOCOL_VERSION,
            false,
          );
          return;
        }

        this.update({
          ...this.snapshot,
          status: "handshaking",
          hostName: message.host_name,
        });
        socket.send(
          encodeClientMessage({
            type: "hello",
            client_id: this.clientId,
            platform: this.platform,
          }),
        );
        return;
      }

      if (message.type === "client_accepted") {
        if (message.client_id !== this.clientId) {
          this.failConnection("Host accepted a different client id", false);
          return;
        }

        this.reconnectAttempt = 0;
        this.update({
          ...this.snapshot,
          status: "connected",
          reconnectAttempt: 0,
          lastError: null,
        });
        this.ping();
        this.startPingTimer();
        return;
      }

      if (message.type === "pong") {
        if (this.pendingPing?.nonce === message.nonce) {
          const latencyMs = Math.max(
            0,
            Math.round(this.now() - this.pendingPing.sentAt),
          );
          this.pendingPing = null;
          this.update({
            ...this.snapshot,
            latencyMs,
          });
        }
        return;
      }

      this.failConnection(message.message, false);
    };

    socket.onerror = () => {
      if (this.socket !== socket) return;
      this.update({
        ...this.snapshot,
        lastError: "WebSocket connection error",
      });
    };

    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearPingTimer();
      this.pendingPing = null;

      if (this.manualDisconnect) {
        return;
      }

      const reason =
        event.reason ||
        (event.code ? "Connection closed (" + event.code + ")" : "Connection closed");
      this.scheduleReconnect(reason);
    };
  }

  private scheduleReconnect(reason: string) {
    const endpoint = this.desiredEndpoint;
    if (!endpoint) return;

    if (this.reconnectAttempt >= this.reconnectDelaysMs.length) {
      this.update({
        status: "error",
        endpoint,
        hostName: this.snapshot.hostName,
        latencyMs: null,
        reconnectAttempt: this.reconnectAttempt,
        lastError: reason + " — reconnect limit reached",
      });
      return;
    }

    const delay = this.reconnectDelaysMs[this.reconnectAttempt];
    this.reconnectAttempt += 1;
    this.update({
      status: "reconnecting",
      endpoint,
      hostName: this.snapshot.hostName,
      latencyMs: null,
      reconnectAttempt: this.reconnectAttempt,
      lastError: reason,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket(true);
    }, delay);
  }

  private failConnection(message: string, retry: boolean) {
    const socket = this.socket;
    this.socket = null;
    this.clearPingTimer();
    this.pendingPing = null;

    if (!retry) {
      this.clearReconnectTimer();
      this.manualDisconnect = true;
      this.update({
        status: "error",
        endpoint: this.desiredEndpoint,
        hostName: this.snapshot.hostName,
        latencyMs: null,
        reconnectAttempt: this.reconnectAttempt,
        lastError: message,
      });
    }

    socket?.close(1000, message.slice(0, 100));
  }

  private startPingTimer() {
    this.clearPingTimer();
    this.pingTimer = setInterval(() => {
      this.ping();
    }, this.pingIntervalMs);
  }

  private detachCurrentSocket() {
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, "client disconnect");
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearPingTimer() {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private update(next: LanClientSnapshot) {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}
