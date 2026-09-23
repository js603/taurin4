import type { OpenMmoWasmExports } from "./codec";

type WasmPackModule = Partial<OpenMmoWasmExports> & {
  default?: (input?: string | URL | Request) => Promise<unknown>;
};

function assertExport(
  module: WasmPackModule,
  key: keyof OpenMmoWasmExports,
) {
  if (typeof module[key] !== "function") {
    throw new Error("OpenMMO WASM export is missing: " + key);
  }
}

export async function loadOpenMmoBrowserCodec(
  moduleUrl: string,
  wasmUrl?: string,
): Promise<OpenMmoWasmExports> {
  if (!moduleUrl.trim()) {
    throw new Error("OpenMMO codec module URL is required");
  }

  const module = (await import(
    /* @vite-ignore */ moduleUrl
  )) as WasmPackModule;

  if (typeof module.default === "function") {
    await module.default(wasmUrl || undefined);
  }

  assertExport(module, "protocol_version");
  assertExport(module, "stamp_layout_version");
  assertExport(module, "serialize_client_message");
  assertExport(module, "deserialize_server_message");

  return module as OpenMmoWasmExports;
}
