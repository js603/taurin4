export interface OpenMmoNativeLaunchConfig {
  serverUrl: string;
  accountName: string;
  npcToken: string;
  autostart: boolean;
}

export async function loadOpenMmoNativeLaunchConfig(): Promise<OpenMmoNativeLaunchConfig | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<OpenMmoNativeLaunchConfig | null>(
      "openmmo_local_launch_config",
    );
  } catch {
    return null;
  }
}
