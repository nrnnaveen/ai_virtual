import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true, // fail loudly instead of silently moving to 5174
    proxy: {
      // IMPORTANT: Do NOT proxy "/ws" — that path is reserved by Vite's own
      // HMR WebSocket and proxying it causes the "ws proxy socket error".
      // We use "/api/ws" instead, which the backend also exposes.
      "/api/ws": {
        target: "ws://localhost:8000",
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/health": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
