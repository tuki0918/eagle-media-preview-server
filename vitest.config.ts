import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: [
      "public/**/*.test.js",
      "plugin/**/*.test.js",
      "server/**/*.test.js",
      "plugin/**/*.test.cjs",
    ],
  },
});
