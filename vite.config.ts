import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const distDir = resolve("dist");

function copyPluginPackageAssets() {
  const includeRuntimeAsset = (sourcePath: string) => !/\.test\.(?:cjs|js|ts|tsx)$/.test(sourcePath)
    && !/\.(?:ts|tsx)$/.test(sourcePath);

  return {
    name: "copy-plugin-package-assets",
    async buildStart() {
      await rm(distDir, { force: true, recursive: true });
    },
    async closeBundle() {
      await mkdir(distDir, { recursive: true });
      await Promise.all([
        cp("manifest.json", resolve(distDir, "manifest.json")),
        cp("plugin", resolve(distDir, "plugin"), { recursive: true, filter: includeRuntimeAsset }),
        cp("public/favicon.ico", resolve(distDir, "public/favicon.ico")),
        cp("public/assets", resolve(distDir, "public/assets"), { recursive: true }),
      ]);
    },
  };
}

export default defineConfig({
  plugins: [react(), copyPluginPackageAssets()],
  publicDir: false,
  build: {
    outDir: "dist/public",
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      output: {
        entryFileNames: "app.js",
        chunkFileNames: "[name].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith(".css")) return "styles.css";
          return "assets/[name][extname]";
        },
      },
    },
  },
});
