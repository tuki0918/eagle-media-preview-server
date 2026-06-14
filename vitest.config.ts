import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "public/**/*.test.ts",
      "plugin/**/*.test.ts",
      "server/**/*.test.ts",
      "plugin/**/*.test.cjs",
    ],
  },
});
