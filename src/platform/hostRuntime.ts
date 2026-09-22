export interface HostSnapshot {
  running: boolean;
  hostName: string;
  bindAddress: string | null;
  port: number | null;
  lanVisible: boolean;
  connectedClients: number;
  protocolVersion: number;
  lastError: string | null;
}

export interface HostStartConfig {
  hostName: string;
  port: number;
  lanVisible: boolean;
}

const webSnapshot: HostSnapshot = {
  running: false,
  hostName: "web preview",
  bindAddress: null,
  port: null,
  lanVisible: false,
  connectedClients: 0,
  protocolVersion: 1,
  lastError: null,
};

export function isTauriRuntime() {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in (window as unknown as Record<string, unknown>)
  );
}

async function invokeHost<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error("Local/LAN Host is available in the Tauri app.");
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export async function getHostStatus(): Promise<HostSnapshot> {
  if (!isTauriRuntime()) return webSnapshot;
  return invokeHost<HostSnapshot>("host_status");
}

export async function startHost(
  config: HostStartConfig,
): Promise<HostSnapshot> {
  return invokeHost<HostSnapshot>("host_start", { config });
}

export async function stopHost(): Promise<HostSnapshot> {
  return invokeHost<HostSnapshot>("host_stop");
}
