export type AppRuntimeMode = "local" | "openmmo";

export function resolveAppRuntimeMode(search: string): AppRuntimeMode {
  const params = new URLSearchParams(search);
  return params.get("runtime") === "openmmo" ? "openmmo" : "local";
}
