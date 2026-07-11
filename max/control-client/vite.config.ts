import path from "node:path";
import fs from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

function resolveTenantConfigPath(): string {
  const root = path.resolve(__dirname, "..");
  const prod = path.join(root, "build-config/tenant.json");
  const dev = path.join(root, "build-config/tenant.dev.json");
  return fs.existsSync(prod) ? prod : dev;
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared"),
      "@tenant-config": resolveTenantConfigPath(),
    },
  },

  clearScreen: false,
  server: {
    port: 1420,
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
    proxy: {
      "/api/librewxr": {
        target: "http://localhost:3100",
        changeOrigin: true,
      },
      "/api/noaa-goes": {
        target: "http://localhost:3100",
        changeOrigin: true,
      },
      "/api/astro": {
        target: "http://localhost:3100",
        changeOrigin: true,
      },
      "/api/imaging": {
        target: "http://localhost:3100",
        changeOrigin: true,
      },
      "/api/astrometry": {
        target: "http://localhost:3100",
        changeOrigin: true,
      },
    },
  },
}));
