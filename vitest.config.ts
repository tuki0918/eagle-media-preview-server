import { defineConfig } from "vitest/config";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Keeps tests out of the real access log, which lives in the OS temp directory.
const testTmpDir = join(tmpdir(), "eagle-media-preview-server-tests");
mkdirSync(testTmpDir, { recursive: true });

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve("src"),
    },
  },
  test: {
    env: { TEMP: testTmpDir, TMP: testTmpDir, TMPDIR: testTmpDir },
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
