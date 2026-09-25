import { OpenMmoAdapter } from "./adapter";
import {
  createOpenMmoWasmCodec,
  type OpenMmoWasmExports,
} from "./codec";
import { isAndroidTauriRuntime } from "../app/platformRuntime";
import { OpenMmoGameSession } from "./session";
import { TauriPluginOpenMmoTransport } from "./tauriTransport";
import {
  WebSocketOpenMmoTransport,
  type OpenMmoTransport,
} from "./transport";

export interface OpenMmoRuntime {
  adapter: OpenMmoAdapter;
  session: OpenMmoGameSession;
}

export interface OpenMmoRuntimeOptions {
  wasm: OpenMmoWasmExports;
  clientVersion?: string;
  requestTimeoutMs?: number;
  transport?: OpenMmoTransport;
}

/**
 * Production bootstrap boundary for the OpenMMO-backed runtime.
 *
 * The caller owns how the pinned WASM exports are loaded. That keeps generated
 * OpenMMO artifacts out of React/game code and lets Windows/Web/CI provide the
 * exact same verified codec through different packaging mechanisms.
 */
export function createOpenMmoRuntime(
  options: OpenMmoRuntimeOptions,
): OpenMmoRuntime {
  const adapter = new OpenMmoAdapter({
    codec: createOpenMmoWasmCodec(options.wasm),
    transport:
      options.transport ??
      (isAndroidTauriRuntime()
        ? new TauriPluginOpenMmoTransport()
        : new WebSocketOpenMmoTransport()),
    clientVersion: options.clientVersion,
    requestTimeoutMs: options.requestTimeoutMs,
  });

  return {
    adapter,
    session: new OpenMmoGameSession(adapter),
  };
}
