export const LAN_PROTOCOL_VERSION = 1;

export type LanClientPlatform = "windows" | "android" | "web" | "unknown";

export type ClientControlMessage =
  | {
      type: "hello";
      client_id: string;
      platform: LanClientPlatform;
    }
  | {
      type: "ping";
      nonce: number;
    };

export type ServerControlMessage =
  | {
      type: "host_hello";
      protocol_version: number;
      host_name: string;
    }
  | {
      type: "client_accepted";
      client_id: string;
    }
  | {
      type: "pong";
      nonce: number;
    }
  | {
      type: "error";
      message: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function encodeClientMessage(message: ClientControlMessage): string {
  return JSON.stringify(message);
}

export function decodeServerMessage(raw: string): ServerControlMessage {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("Invalid LAN server message");
  }

  switch (value.type) {
    case "host_hello":
      if (
        typeof value.protocol_version !== "number" ||
        typeof value.host_name !== "string"
      ) {
        throw new Error("Invalid host_hello payload");
      }
      return {
        type: "host_hello",
        protocol_version: value.protocol_version,
        host_name: value.host_name,
      };

    case "client_accepted":
      if (typeof value.client_id !== "string") {
        throw new Error("Invalid client_accepted payload");
      }
      return {
        type: "client_accepted",
        client_id: value.client_id,
      };

    case "pong":
      if (typeof value.nonce !== "number") {
        throw new Error("Invalid pong payload");
      }
      return {
        type: "pong",
        nonce: value.nonce,
      };

    case "error":
      if (typeof value.message !== "string") {
        throw new Error("Invalid error payload");
      }
      return {
        type: "error",
        message: value.message,
      };

    default:
      throw new Error("Unknown LAN server message: " + value.type);
  }
}

export function normalizeLanEndpoint(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Host address is required");
  }

  const candidate =
    trimmed.startsWith("ws://") || trimmed.startsWith("wss://")
      ? trimmed
      : "ws://" + trimmed;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Invalid host address");
  }

  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error("LAN host must use ws:// or wss://");
  }

  if (!url.hostname) {
    throw new Error("Host name or IP is required");
  }

  if (!url.port) {
    url.port = "10006";
  }

  url.pathname = "/";
  url.search = "";
  url.hash = "";

  return url.toString().replace(/\/$/, "");
}
