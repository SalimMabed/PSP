/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// The PWA / service worker of the source project is deliberately not carried over:
// an offline cache makes no sense for a sandbox whose data changes on every action.
export default defineConfig({
  // "/" by default; set VITE_BASE=/PSP/ to serve the app from a sub-path (GitHub Pages).
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    rollupOptions: {
      output: {
        // Splits the large dependencies: better browser caching, lighter application chunk.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          data: ["dexie", "zod", "zustand", "uuid"],
        },
      },
    },
  },
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // jsdom + simulated IndexedDB journeys are slow under load (several files in parallel).
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
