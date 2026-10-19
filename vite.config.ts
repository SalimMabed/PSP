/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Le PWA/service worker du projet source n'est volontairement pas repris :
// un cache hors-ligne n'a pas de sens pour une sandbox dont les données changent à chaque action.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    rollupOptions: {
      output: {
        // Sépare les dépendances volumineuses : meilleur cache navigateur, chunk applicatif plus léger.
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
    // Les parcours jsdom + IndexedDB simulé sont lents sous charge (plusieurs fichiers en parallèle).
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
