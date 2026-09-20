import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const host = process.env.TAURI_DEV_HOST;
const tauriPlatform = process.env.TAURI_ENV_PLATFORM;
const isTauriBuild = Boolean(tauriPlatform);
const webBasePath = process.env.VITE_BASE_PATH || "/taurin4/";

export default defineConfig({
  base: isTauriBuild ? "/" : webBasePath,
  plugins: [
    react(),
    ...(!isTauriBuild
      ? [
          VitePWA({
            registerType: "autoUpdate",
            workbox: {
              navigateFallbackDenylist: [/^\/taurin4\/submain(?:\/|$)/],
            },
            manifest: {
              name: "중세재판",
              short_name: "중세재판",
              description: "성 아그네스 성에서 펼쳐지는 결정론적 추리 재판",
              theme_color: "#171310",
              background_color: "#171310",
              display: "standalone",
              start_url: webBasePath,
              scope: webBasePath,
            },
          }),
        ]
      : []),
  ],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: tauriPlatform === "windows" ? "chrome105" : isTauriBuild ? "safari13" : "es2022",
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
