import { describe, expect, it } from "vitest";
import {
  decodeServerMessage,
  encodeClientMessage,
  normalizeLanEndpoint,
} from "./lanProtocol";

describe("LAN control protocol", () => {
  it("encodes the Windows hello expected by the Rust host", () => {
    expect(
      encodeClientMessage({
        type: "hello",
        client_id: "pc-b",
        platform: "windows",
      }),
    ).toBe('{"type":"hello","client_id":"pc-b","platform":"windows"}');
  });

  it("decodes host hello and pong messages", () => {
    expect(
      decodeServerMessage(
        '{"type":"host_hello","protocol_version":1,"host_name":"pc-a"}',
      ),
    ).toEqual({
      type: "host_hello",
      protocol_version: 1,
      host_name: "pc-a",
    });

    expect(decodeServerMessage('{"type":"pong","nonce":42}')).toEqual({
      type: "pong",
      nonce: 42,
    });
  });

  it("normalizes manual LAN addresses", () => {
    expect(normalizeLanEndpoint("192.168.0.15")).toBe(
      "ws://192.168.0.15:10006",
    );
    expect(normalizeLanEndpoint("192.168.0.15:12000")).toBe(
      "ws://192.168.0.15:12000",
    );
  });

  it("rejects malformed server messages", () => {
    expect(() => decodeServerMessage('{"type":"pong"}')).toThrow(
      "Invalid pong payload",
    );
  });
});
