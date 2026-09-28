export type OpenMmoEmbeddedPhase =
  | "idle"
  | "prepared"
  | "starting"
  | "running"
  | "stopping"
  | "failed";

export interface OpenMmoEmbeddedPaths {
  rootDir: string;
  stateDir: string;
  terrainDir: string;
  npcDataDir: string;
  talesLedger: string;
  geoipDb: string;
}

export interface OpenMmoEmbeddedSnapshot {
  phase: OpenMmoEmbeddedPhase;
  pinnedCommit: string;
  coreLinked: boolean;
  serverUrl: string | null;
  apiUrl: string | null;
  paths: OpenMmoEmbeddedPaths | null;
  lastError: string | null;
}

export interface OpenMmoEmbeddedLaunchConfig {
  serverUrl: string;
  accountName: string;
  npcToken: string;
  autostart: boolean;
}

async function invokeEmbedded<T>(command: string): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command);
}

export function loadOpenMmoEmbeddedStatus(): Promise<OpenMmoEmbeddedSnapshot> {
  return invokeEmbedded<OpenMmoEmbeddedSnapshot>("openmmo_embedded_status");
}

export function prepareOpenMmoEmbeddedHost(): Promise<OpenMmoEmbeddedSnapshot> {
  return invokeEmbedded<OpenMmoEmbeddedSnapshot>("openmmo_embedded_prepare");
}

export function startOpenMmoEmbeddedHost(): Promise<OpenMmoEmbeddedLaunchConfig> {
  return invokeEmbedded<OpenMmoEmbeddedLaunchConfig>("openmmo_embedded_start");
}

export function stopOpenMmoEmbeddedHost(): Promise<OpenMmoEmbeddedSnapshot> {
  return invokeEmbedded<OpenMmoEmbeddedSnapshot>("openmmo_embedded_stop");
}
