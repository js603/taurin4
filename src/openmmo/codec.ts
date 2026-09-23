import type {
  OpenMmoClientMessage,
  OpenMmoServerMessage,
} from "./types";

export interface OpenMmoCodec {
  protocolVersion(): number;
  stampLayoutVersion(clientVersion: string): string;
  encodeClient(message: OpenMmoClientMessage): Uint8Array;
  decodeServer(bytes: Uint8Array): OpenMmoServerMessage;
}

/**
 * Adapter around the original OpenMMO shared WASM exports.
 *
 * idea2 deliberately depends on this interface rather than importing the
 * original WASM module from React/gameplay code. The actual pinned codec can
 * therefore be supplied by a native/web bootstrap without leaking wire-format
 * details into GameSession.
 */
export interface OpenMmoWasmExports {
  protocol_version(): number;
  stamp_layout_version(version: string): string;
  serialize_client_message(message: unknown): Uint8Array;
  deserialize_server_message(bytes: Uint8Array): unknown;
}

export function createOpenMmoWasmCodec(
  wasm: OpenMmoWasmExports,
): OpenMmoCodec {
  return {
    protocolVersion: () => wasm.protocol_version(),
    stampLayoutVersion: (version) => wasm.stamp_layout_version(version),
    encodeClient: (message) =>
      wasm.serialize_client_message(message) as Uint8Array,
    decodeServer: (bytes) =>
      wasm.deserialize_server_message(bytes) as OpenMmoServerMessage,
  };
}
