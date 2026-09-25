export function isTauriRuntime() {
  if (typeof window === "undefined") return false;

  return (
    (
      window as Window & {
        __TAURI_INTERNALS__?: unknown;
      }
    ).__TAURI_INTERNALS__ !== undefined
  );
}

export function isAndroidRuntime() {
  if (typeof navigator === "undefined") return false;
  return /\bAndroid\b/i.test(navigator.userAgent);
}

export function isAndroidTauriRuntime() {
  return isTauriRuntime() && isAndroidRuntime();
}
