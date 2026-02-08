import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  build: {
    target: "es2022", // Support modern features to avoid aggressive transpilation
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "es2022",
    },
  },
  define: {
    "process.env": {}, // Shim if needed
    global: "window", // Shim if needed
  },
});
