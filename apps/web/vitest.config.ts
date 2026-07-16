import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    server: {
      deps: {
        // next-intl ships ESM that imports extensionless "next/*" subpaths;
        // inline it so Vite resolves those instead of Node ESM.
        inline: ["next-intl", "use-intl"],
      },
    },
  },
});
