import { afterEach, describe, expect, it, vi } from "vitest";
import { LanClient } from "./lanClient";

class FakeSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  closed = false;

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
  }

  open() {
    this.onopen?.();
  }

  message(data: string) {
    this.onmessage?.({ data });
  }

  remoteClose(code = 1006, reason = "") {
    this.onclose?.({ code, reason });
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("LanClient", () => {
  it("completes handshake and measures ping latency", () => {
    let now = 100;
    const sockets: FakeSocket[] = [];
    const client = new LanClient({
      clientId: "pc-b",
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      now: () => now,
      pingIntervalMs: 60_000,
    });

    client.connect("192.168.0.15:10006");
    expect(client.getSnapshot().status).toBe("connecting");

    const socket = sockets[0];
    socket.open();
    expect(client.getSnapshot().status).toBe("handshaking");

    socket.message(
      '{"type":"host_hello","protocol_version":1,"host_name":"pc-a"}',
    );
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: "hello",
      client_id: "pc-b",
      platform: "windows",
    });

    socket.message('{"type":"client_accepted","client_id":"pc-b"}');
    expect(client.getSnapshot().status).toBe("connected");
    expect(client.getSnapshot().hostName).toBe("pc-a");

    const ping = JSON.parse(socket.sent[1]) as {
      type: string;
      nonce: number;
    };
    expect(ping.type).toBe("ping");

    now = 127;
    socket.message(JSON.stringify({ type: "pong", nonce: ping.nonce }));
    expect(client.getSnapshot().latencyMs).toBe(27);

    client.disconnect();
    expect(client.getSnapshot().status).toBe("idle");
  });

  it("reconnects after an unexpected disconnect", () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const client = new LanClient({
      clientId: "pc-b",
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      reconnectDelaysMs: [500, 1500],
      pingIntervalMs: 60_000,
      now: () => 0,
    });

    client.connect("127.0.0.1:10006");
    sockets[0].open();
    sockets[0].message(
      '{"type":"host_hello","protocol_version":1,"host_name":"pc-a"}',
    );
    sockets[0].message('{"type":"client_accepted","client_id":"pc-b"}');
    expect(client.getSnapshot().status).toBe("connected");

    sockets[0].remoteClose();
    expect(client.getSnapshot().status).toBe("reconnecting");
    expect(client.getSnapshot().reconnectAttempt).toBe(1);

    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);
    expect(client.getSnapshot().status).toBe("reconnecting");

    sockets[1].open();
    sockets[1].message(
      '{"type":"host_hello","protocol_version":1,"host_name":"pc-a"}',
    );
    sockets[1].message('{"type":"client_accepted","client_id":"pc-b"}');
    expect(client.getSnapshot().status).toBe("connected");
    expect(client.getSnapshot().reconnectAttempt).toBe(0);

    client.disconnect();
  });

  it("fails fast on protocol mismatch instead of retrying forever", () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const client = new LanClient({
      clientId: "pc-b",
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      reconnectDelaysMs: [500],
    });

    client.connect("127.0.0.1");
    sockets[0].open();
    sockets[0].message(
      '{"type":"host_hello","protocol_version":99,"host_name":"pc-a"}',
    );

    expect(client.getSnapshot().status).toBe("error");
    expect(client.getSnapshot().lastError).toContain("protocol mismatch");

    vi.advanceTimersByTime(5000);
    expect(sockets).toHaveLength(1);
  });
});
