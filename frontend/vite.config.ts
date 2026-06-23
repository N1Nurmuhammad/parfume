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
    rollupOptions: {
      output: {
        // Split rarely-changing vendor code into its own chunk. After a deploy
        // that only touches app code, the browser keeps the cached vendor chunk
        // and re-downloads just the small app chunk. recharts/@mantine/charts are
        // intentionally NOT listed here so they stay in the lazy Dashboard chunk.
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          mantine: [
            "@mantine/core",
            "@mantine/hooks",
            "@mantine/dates",
            "@mantine/notifications",
          ],
        },
      },
    },
  },
});
