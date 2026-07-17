import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "vitest";

test("public viewer declares an installable PWA", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const manifest = JSON.parse(await readFile(new URL("./manifest.webmanifest", import.meta.url), "utf8"));

  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/assets\/pwa-icon-180\.png"/);
  assert.match(html, /<meta name="theme-color"/);
  assert.equal(manifest.name, "Media Preview Server");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(
    manifest.icons.map(({ sizes, src }: { sizes: string; src: string }) => [sizes, src]),
    [
      ["192x192", "/assets/pwa-icon-192.png"],
      ["512x512", "/assets/pwa-icon-512.png"],
    ],
  );

  await Promise.all([
    access(new URL("./assets/pwa-icon-180.png", import.meta.url)),
    access(new URL("./assets/pwa-icon-192.png", import.meta.url)),
    access(new URL("./assets/pwa-icon-512.png", import.meta.url)),
  ]);
});

test("service worker caches only the application shell", async () => {
  const worker = await readFile(new URL("./service-worker.js", import.meta.url), "utf8");
  const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");

  assert.match(main, /import\.meta\.env\.PROD/);
  assert.match(main, /serviceWorker\.register\("\/service-worker\.js", \{ scope: "\/" \}\)/);
  assert.match(worker, /cache\.addAll\(APP_SHELL\)/);
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /url\.pathname\.startsWith\("\/file\/"\)/);
});
