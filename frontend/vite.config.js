import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Load env vars so we can use VITE_API_URL in the dev proxy target.
  const env = loadEnv(mode, process.cwd(), "");
  const apiUrl = env.VITE_API_URL || "http://localhost:8000";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true, // fail loudly instead of silently moving to 5174
      proxy: {
        // IMPORTANT: Do NOT proxy "/ws" — that path is reserved by Vite's own
        // HMR WebSocket and proxying it causes the "ws proxy socket error".
        // We use "/api/ws" instead, which the backend also exposes.
        "/api/ws": {
          target: apiUrl.replace(/^http/, "ws"),
          ws: true,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
        "/health": {
          target: apiUrl,
          changeOrigin: true,
        },
      },
    },
  };
});
