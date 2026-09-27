export type OpenMmoEmbeddedPhase = "idle" | "prepared" | "failed";

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
  paths: OpenMmoEmbeddedPaths | null;
  lastError: string | null;
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

export function stopOpenMmoEmbeddedHost(): Promise<OpenMmoEmbeddedSnapshot> {
  return invokeEmbedded<OpenMmoEmbeddedSnapshot>("openmmo_embedded_stop");
}
