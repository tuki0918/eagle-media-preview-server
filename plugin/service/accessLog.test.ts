import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { accessLogCsv, createAccessLog } = require("../../dist/.generated/plugin-service/accessLog.cjs");

const HOUR = 60 * 60 * 1000;

async function tempLogPath() {
  return join(await mkdtemp(join(tmpdir(), "access-log-")), "access-log.jsonl");
}

test("access log persists entries and restores them in a new instance", async () => {
  const filePath = await tempLogPath();
  const log = createAccessLog({ filePath });
  log.record({ type: "auth", event: "login_failure", ip: "192.168.1.20", user: "viewer1", status: 401 });
  log.record({ type: "view", event: "view", ip: "192.168.1.20", itemId: "ITEM1", user: "viewer1", status: 200 });
  await log.flush();

  const restored = createAccessLog({ filePath });
  await restored.load();
  const recent = restored.entries();
  assert.equal(recent.length, 2);
  assert.equal(recent[0].itemId, "ITEM1");
  assert.equal(recent[1].event, "login_failure");
  assert.equal(restored.entries({ type: "auth" }).length, 1);
});

test("access log drops entries past the age limit when loading", async () => {
  const filePath = await tempLogPath();
  const now = Date.now();
  await writeFile(filePath, [
    JSON.stringify({ at: now - 10 * 24 * HOUR, type: "view", event: "view", ip: "10.0.0.1" }),
    "not json",
    JSON.stringify({ at: now - HOUR, type: "view", event: "view", ip: "10.0.0.2" }),
  ].join("\n"));
  const log = createAccessLog({ filePath, now: () => now });
  await log.load();
  assert.deepEqual(log.entries().map((entry: { ip: string }) => entry.ip), ["10.0.0.2"]);
  assert.equal((await readFile(filePath, "utf8")).trim().split("\n").length, 1);
});

test("access log summary buckets by hour and tracks connected clients", async () => {
  const filePath = await tempLogPath();
  let now = Date.UTC(2026, 10, 3, 12, 30);
  const log = createAccessLog({ filePath, now: () => now });
  log.record({ type: "view", event: "view", ip: "192.168.1.20", user: "alice", at: now - 3 * HOUR });
  log.record({ type: "browse", event: "items", ip: "192.168.1.20", user: "alice", at: now - 3 * HOUR });
  log.record({ type: "auth", event: "login_failure", ip: "192.168.1.30", at: now - 10 * 60 * 1000 });
  log.touch("192.168.1.40", "bob");

  const summary = log.summary({ range: "24h" });
  assert.equal(summary.buckets.length, 24);
  const busy = summary.buckets.find((bucket: { start: number }) => bucket.start === Date.UTC(2026, 10, 3, 9));
  assert.equal(busy.view, 1);
  assert.equal(busy.browse, 1);
  assert.equal(summary.totals.authFailures, 1);
  assert.equal(summary.activeClients, 1);
  assert.equal(summary.clients[0].ip, "192.168.1.40");
  assert.deepEqual(summary.clients[0].users, ["bob"]);
  assert.deepEqual(summary.clients.find((client: { ip: string }) => client.ip === "192.168.1.20").users, ["alice"]);

  now += 5 * 60 * 1000;
  assert.equal(log.summary().activeClients, 0);
});

test("access log rewrites the file from memory when it grows past the limit", async () => {
  const filePath = await tempLogPath();
  const log = createAccessLog({ filePath, maxEntries: 3, maxFileBytes: 400 });
  for (let index = 0; index < 10; index += 1) {
    log.record({ type: "browse", event: "items", ip: `10.0.0.${index}` });
    await log.flush();
  }
  const lines = (await readFile(filePath, "utf8")).trim().split("\n");
  assert.ok(lines.length <= 6, `expected a rotated file, got ${lines.length} lines`);
  assert.equal(JSON.parse(lines.at(-1) || "{}").ip, "10.0.0.9");
});

test("access log clear removes memory and file", async () => {
  const filePath = await tempLogPath();
  const log = createAccessLog({ filePath });
  log.record({ type: "view", event: "view", ip: "10.0.0.1" });
  await log.flush();
  await log.clear();
  assert.equal(log.entries().length, 0);
  await assert.rejects(readFile(filePath, "utf8"));
});

test("access log CSV quotes cells that need it", () => {
  const csv = accessLogCsv([{ at: Date.UTC(2026, 0, 1), type: "browse", event: "search", ip: "10.0.0.1", path: "/api/items?q=a,\"b\"" }]);
  assert.equal(csv, "at,type,event,ip,user,method,path,itemId,status\n2026-01-01T00:00:00.000Z,browse,search,10.0.0.1,,,\"/api/items?q=a,\"\"b\"\"\",,\n");
});

test("access log reads recent entries from the newest end and counts active clients cheaply", async () => {
  const filePath = await tempLogPath();
  let now = Date.UTC(2026, 10, 3, 12);
  const log = createAccessLog({ filePath, now: () => now });
  for (let index = 0; index < 50; index += 1) log.record({ type: index % 10 ? "browse" : "auth", event: "x", ip: `10.0.0.${index % 3}` });
  const auth = log.entries({ limit: 2, type: "auth" });
  assert.equal(auth.length, 2);
  assert.ok(auth.every((entry: { type: string }) => entry.type === "auth"));
  assert.equal(log.activeClients(), 3);
  now += 3 * 60 * 1000;
  assert.equal(log.activeClients(), 0);
  assert.equal(log.summary({ clientLimit: 1 }).clients.length, 1);
  assert.equal(log.summary({ clientLimit: 1 }).clientCount, 3);
});
