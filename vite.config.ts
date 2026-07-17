import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { build as esbuild } from "esbuild";

const distDir = resolve("dist");
const generatedPluginServiceDir = resolve(distDir, ".generated", "plugin-service");

function copyPluginPackageAssets() {
  const includeRuntimeAsset = (sourcePath: string) => !/\.test\.(?:cjs|js|ts|tsx)$/.test(sourcePath)
    && !/\.(?:cts|mts|ts|tsx)$/.test(sourcePath)
    && !/plugin[\\/]app\.(?:js|tsx)$/.test(sourcePath);

  return {
    name: "copy-plugin-package-assets",
    async buildStart() {
      await Promise.all([
        rm(resolve(distDir, "manifest.json"), { force: true }),
        rm(resolve(distDir, "plugin"), { force: true, recursive: true }),
        rm(resolve(distDir, "public"), { force: true, recursive: true }),
      ]);
    },
    async closeBundle() {
      await mkdir(distDir, { recursive: true });
      await Promise.all([
        cp("manifest.json", resolve(distDir, "manifest.json")),
        cp("plugin", resolve(distDir, "plugin"), { recursive: true, filter: includeRuntimeAsset }),
        cp("public/favicon.ico", resolve(distDir, "public/favicon.ico")),
        cp("public/manifest.webmanifest", resolve(distDir, "public/manifest.webmanifest")),
        cp("public/service-worker.js", resolve(distDir, "public/service-worker.js")),
        cp("public/assets", resolve(distDir, "public/assets"), { recursive: true }),
      ]);
      await cp(generatedPluginServiceDir, resolve(distDir, "plugin", "service"), { recursive: true });
      await esbuild({
        bundle: true,
        define: {
          "process.env.NODE_ENV": JSON.stringify("production"),
        },
        entryPoints: ["plugin/app.tsx"],
        format: "iife",
        jsx: "automatic",
        outfile: resolve(distDir, "plugin/app.js"),
        platform: "browser",
      });
      await cp(resolve(distDir, "public/styles.css"), resolve(distDir, "plugin/styles.css"));
    },
  };
}

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve("src"),
    },
  },
  plugins: [
    react(),
    ...(process.env.STORYBOOK === "1" ? [] : [copyPluginPackageAssets()]),
  ],
  publicDir: false,
  build: {
    outDir: "dist/public",
    emptyOutDir: true,
    minify: true,
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
