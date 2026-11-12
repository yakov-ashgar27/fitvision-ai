/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:8000" } },
  preview: { proxy: { "/api": "http://localhost:8000" } },
  build: {
    target: "es2020",
    sourcemap: false,
    rollupOptions: {
      output: {
        // keep the trainer-only chart library out of the trainee bundles (6.3.1)
        manualChunks: { recharts: ["recharts"], query: ["@tanstack/react-query"] },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
