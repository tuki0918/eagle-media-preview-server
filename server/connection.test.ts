import { test } from "vitest";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createConnectionContext } = require("../dist/.generated/plugin-service/connection.cjs");

test("createConnectionContext shares one library info request while it is cached", async () => {
  let calls = 0;
  const context = createConnectionContext({
    client: {
      async libraryInfo() {
        calls += 1;
        return { path: "/tmp/Library.library", name: "Library" };
      },
    },
  });

  const [first, second] = await Promise.all([context.libraryInfo(), context.libraryInfo()]);
  assert.equal(first.path, "/tmp/Library.library");
  assert.equal(second.path, "/tmp/Library.library");
  assert.equal(calls, 1);
});

test("createConnectionContext retries after a failed library info request", async () => {
  let calls = 0;
  const context = createConnectionContext({
    client: {
      async libraryInfo() {
        calls += 1;
        if (calls === 1) throw new Error("offline");
        return { path: "/tmp/Library.library" };
      },
    },
  });

  await assert.rejects(() => context.libraryInfo(), /offline/);
  assert.equal((await context.libraryInfo()).path, "/tmp/Library.library");
});

test("createConnectionContext refreshes library info after the TTL and on clear", async () => {
  let current = "/tmp/A.library";
  let calls = 0;
  const context = createConnectionContext({
    client: {
      async libraryInfo() {
        calls += 1;
        return { path: current };
      },
    },
    libraryInfoTtlMs: 20,
  });

  assert.equal((await context.libraryInfo()).path, "/tmp/A.library");
  current = "/tmp/B.library";
  assert.equal((await context.libraryInfo()).path, "/tmp/A.library");
  context.clearLibraryInfo();
  assert.equal((await context.libraryInfo()).path, "/tmp/B.library");
  current = "/tmp/C.library";
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 30));
  assert.equal((await context.libraryInfo()).path, "/tmp/C.library");
  assert.equal(calls, 3);
});
