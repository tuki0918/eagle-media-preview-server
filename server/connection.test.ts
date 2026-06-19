import { test } from "vitest";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildConnectionCandidates,
  createConnectionContext,
  requiresToken,
  normalizeConnectionInput,
} = require("../dist/.generated/plugin-service/connection.cjs");

type ConnectionCandidate = { baseUrl: string };

test("normalizeConnectionInput builds Eagle base URL from host and port", () => {
  assert.deepEqual(
    normalizeConnectionInput({ host: " 192.168.1.20 ", port: "41595", token: " secret " }),
    {
      host: "192.168.1.20",
      port: 41595,
      token: "secret",
      baseUrl: "http://192.168.1.20:41595",
    },
  );
});

test("normalizeConnectionInput uses localhost and Eagle default port", () => {
  assert.equal(normalizeConnectionInput({}).baseUrl, "http://127.0.0.1:41595");
});

test("normalizeConnectionInput rejects invalid ports", () => {
  assert.throws(() => normalizeConnectionInput({ port: "abc" }), /Invalid port/);
  assert.throws(() => normalizeConnectionInput({ port: "70000" }), /Invalid port/);
});

test("normalizeConnectionInput requires token for remote Eagle hosts", () => {
  assert.throws(
    () => normalizeConnectionInput(
      { host: "192.168.1.30", port: "41595" },
      { requestHost: "192.168.1.20:41532", requireRemoteToken: true },
    ),
    /token/,
  );
});

test("requiresToken treats localhost and viewer host as local connections", () => {
  assert.equal(requiresToken({ host: "127.0.0.1", requestHost: "192.168.1.20:41532" }), false);
  assert.equal(requiresToken({ host: "192.168.1.20", requestHost: "192.168.1.20:41532" }), false);
  assert.equal(requiresToken({ host: "192.168.1.30", requestHost: "192.168.1.20:41532" }), true);
});

test("buildConnectionCandidates tries localhost first when user enters the viewer host", () => {
  assert.deepEqual(
    buildConnectionCandidates({
      input: { host: "192.168.1.20", port: "41595", token: "abc" },
      requestHost: "192.168.1.20:41532",
    }).map((candidate: ConnectionCandidate) => candidate.baseUrl),
    ["http://127.0.0.1:41595", "http://192.168.1.20:41595"],
  );
});

test("buildConnectionCandidates does not add localhost for a different remote host", () => {
  assert.deepEqual(
    buildConnectionCandidates({
      input: { host: "192.168.1.30", port: "41595", token: "abc" },
      requestHost: "192.168.1.20:41532",
    }).map((candidate: ConnectionCandidate) => candidate.baseUrl),
    ["http://192.168.1.30:41595"],
  );
});

test("createConnectionContext returns a client and isolated library cache", async () => {
  const context = createConnectionContext({
    input: { host: "localhost", port: "41595" },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          status: "success",
          data: { path: "/tmp/Library.library", name: "Library" },
        });
      },
    }),
  });

  assert.equal(context.connection.baseUrl, "http://localhost:41595");
  assert.equal((await context.libraryInfo()).path, "/tmp/Library.library");
  assert.equal((await context.libraryInfo()).path, "/tmp/Library.library");
});
