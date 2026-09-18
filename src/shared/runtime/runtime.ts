export type RuntimeKind = "web" | "tauri";

export function runtimeKind(): RuntimeKind {
  return import.meta.env.TAURI_ENV_PLATFORM ? "tauri" : "web";
}

export function runtimeLabel(): string {
  const platform = import.meta.env.TAURI_ENV_PLATFORM;
  return platform ? `Tauri · ${platform}` : "Web / PWA";
}
