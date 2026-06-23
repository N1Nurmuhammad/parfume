import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Build outputs to dist/, which the Docker image copies into app/static so the
// FastAPI backend serves the SPA on :8090. During local dev, /api is proxied to
// the backend container.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": "http://localhost:8090",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
