export interface BinarySocket {
  binaryType: string;
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: (() => void) | null;
  send(data: ArrayBufferView | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
}

export interface OpenMmoTransportHandlers {
  onOpen: () => void;
  onBinary: (bytes: Uint8Array) => void;
  onClose: (code: number, reason: string) => void;
  onError: (message: string) => void;
}

export interface OpenMmoTransport {
  connect(endpoint: string, handlers: OpenMmoTransportHandlers): void;
  send(bytes: Uint8Array): boolean;
  close(code?: number, reason?: string): void;
  isOpen(): boolean;
}

export interface WebSocketTransportOptions {
  socketFactory?: (endpoint: string) => BinarySocket;
}

function defaultSocketFactory(endpoint: string): BinarySocket {
  return new WebSocket(endpoint) as unknown as BinarySocket;
}

export class WebSocketOpenMmoTransport implements OpenMmoTransport {
  private socket: BinarySocket | null = null;
  private readonly socketFactory: (endpoint: string) => BinarySocket;

  constructor(options: WebSocketTransportOptions = {}) {
    this.socketFactory = options.socketFactory ?? defaultSocketFactory;
  }

  connect(endpoint: string, handlers: OpenMmoTransportHandlers) {
    this.close(1000, "reconnect");

    const socket = this.socketFactory(endpoint);
    this.socket = socket;
    socket.binaryType = "arraybuffer";

    socket.onopen = () => {
      if (this.socket !== socket) return;
      handlers.onOpen();
    };

    socket.onmessage = (event) => {
      if (this.socket !== socket) return;

      if (event.data instanceof ArrayBuffer) {
        handlers.onBinary(new Uint8Array(event.data));
        return;
      }

      if (ArrayBuffer.isView(event.data)) {
        handlers.onBinary(
          new Uint8Array(
            event.data.buffer,
            event.data.byteOffset,
            event.data.byteLength,
          ),
        );
        return;
      }

      handlers.onError("OpenMMO server sent a non-binary frame");
    };

    socket.onerror = () => {
      if (this.socket !== socket) return;
      handlers.onError("OpenMMO WebSocket error");
    };

    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      handlers.onClose(event.code, event.reason);
    };
  }

  send(bytes: Uint8Array) {
    if (!this.isOpen() || !this.socket) return false;
    this.socket.send(bytes);
    return true;
  }

  close(code = 1000, reason = "client close") {
    const socket = this.socket;
    this.socket = null;
    socket?.close(code, reason);
  }

  isOpen() {
    return this.socket?.readyState === WebSocket.OPEN;
  }
}
