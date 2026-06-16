import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve("src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "public/**/*.test.ts",
      "plugin/**/*.test.ts",
      "server/**/*.test.ts",
    ],
  },
});
