import { describe, expect, it, vi } from "vitest";
import { TauriPluginOpenMmoTransport } from "./tauriTransport";

type Listener = (message:
  | { type: "Text"; data: string }
  | { type: "Binary"; data: number[] }
  | { type: "Ping"; data: number[] }
  | { type: "Pong"; data: number[] }
  | { type: "Close"; data: { code: number; reason: string } | null }
) => void;

class FakePluginSocket {
  listener: Listener | null = null;
  sent: unknown[] = [];

  addListener(listener: Listener) {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = null;
    };
  }

  async send(message: unknown) {
    this.sent.push(message);
  }

  async disconnect() {}

  emit(message: Parameters<Listener>[0]) {
    this.listener?.(message);
  }
}

describe("TauriPluginOpenMmoTransport", () => {
  it("adapts Rust-plugin binary messages to the OpenMMO transport contract", async () => {
    const socket = new FakePluginSocket();
    const onOpen = vi.fn();
    const onBinary = vi.fn();
    const onClose = vi.fn();
    const onError = vi.fn();

    const transport = new TauriPluginOpenMmoTransport(async () => socket);
    transport.connect("ws://10.0.2.2:10006", {
      onOpen,
      onBinary,
      onClose,
      onError,
    });

    await vi.waitFor(() => expect(onOpen).toHaveBeenCalledOnce());
    expect(transport.isOpen()).toBe(true);

    socket.emit({ type: "Binary", data: [1, 2, 255] });
    expect(onBinary).toHaveBeenCalledOnce();
    expect(Array.from(onBinary.mock.calls[0][0] as Uint8Array)).toEqual([
      1, 2, 255,
    ]);

    expect(transport.send(new Uint8Array([9, 8, 7]))).toBe(true);
    await vi.waitFor(() =>
      expect(socket.sent).toContainEqual([9, 8, 7]),
    );

    socket.emit({
      type: "Close",
      data: { code: 1001, reason: "server restart" },
    });
    expect(onClose).toHaveBeenCalledWith(1001, "server restart");
    expect(transport.isOpen()).toBe(false);
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports plugin connection failures without pretending to be open", async () => {
    const onError = vi.fn();
    const transport = new TauriPluginOpenMmoTransport(async () => {
      throw new Error("connect denied");
    });

    transport.connect("ws://192.168.0.10:10006", {
      onOpen: vi.fn(),
      onBinary: vi.fn(),
      onClose: vi.fn(),
      onError,
    });

    await vi.waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        "OpenMMO Tauri WebSocket error: connect denied",
      ),
    );
    expect(transport.isOpen()).toBe(false);
  });
});
