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
  log.record({ type: "browse", event: "items", ip: "192.168.1.20", user: "alice", status: 502, at: now - 3 * HOUR });
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
  assert.equal(summary.clients[0].user, "bob");
  assert.equal(summary.clients.find((client: { ip: string }) => client.ip === "192.168.1.20").user, "alice");

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
  assert.equal(csv, "at,type,event,ip,user,method,path,libraryId,itemId,fields,ext,size,status\n2026-01-01T00:00:00.000Z,browse,search,10.0.0.1,,,\"/api/items?q=a,\"\"b\"\"\",,,,,,\n");
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

test("access log summary splits a shared address into one row per user", async () => {
  const filePath = await tempLogPath();
  const now = Date.UTC(2026, 10, 3, 12);
  const log = createAccessLog({ filePath, now: () => now });
  log.touch("10.0.0.5", "");
  log.record({ type: "auth", event: "login_failure", ip: "10.0.0.5", user: "bob", status: 401, at: now - 60 * 1000 });
  log.record({ type: "auth", event: "login_success", ip: "10.0.0.5", user: "alice", at: now - 30 * 1000 });
  log.record({ type: "view", event: "view", ip: "10.0.0.5", user: "alice", at: now - 20 * 1000 });
  log.record({ type: "browse", event: "items", ip: "10.0.0.9", at: now - 90 * 1000 });

  const summary = log.summary();
  const rows = summary.clients.map((client: { ip: string; user: string; edits: number; authFailures: number; views: number }) => [client.ip, client.user, client.edits, client.views, client.authFailures]);
  // The pre-sign-in poll on 10.0.0.5 adds no "no user" row; rows of one address stay together.
  assert.deepEqual(rows, [
    ["10.0.0.5", "alice", 0, 1, 0],
    ["10.0.0.5", "bob", 0, 0, 1],
    ["10.0.0.9", "", 0, 0, 0],
  ]);
  assert.equal(summary.clientCount, 3);
  assert.equal(summary.activeClients, 2);
  assert.equal(log.activeClients(), 2);
});

test("access log CSV keeps client-supplied cells from running as spreadsheet formulas", () => {
  const csv = accessLogCsv([{ at: Date.UTC(2026, 0, 1), type: "auth", event: "login_failure", ip: "10.0.0.1", user: "=1+1", path: "@SUM(A1)" }]);
  assert.equal(csv.split("\n")[1], "2026-01-01T00:00:00.000Z,auth,login_failure,10.0.0.1,'=1+1,,'@SUM(A1),,,,,,");
});

test("access log rotation does not write a pending entry twice", async () => {
  const filePath = await tempLogPath();
  // The first entry is large so the next flush rotates, and the rewritten file is small enough to append to.
  const log = createAccessLog({ filePath, flushDelayMs: 60_000, maxEntries: 2, maxFileBytes: 350 });
  log.record({ type: "browse", event: "items", ip: "10.0.0.1", path: `/api/items?q=${"x".repeat(250)}` });
  await log.flush();
  log.record({ type: "browse", event: "items", ip: "10.0.0.2" });
  // The flush rotates; the entry recorded while it waits must not also be appended afterwards.
  const rotating = log.flush();
  log.record({ type: "browse", event: "items", ip: "10.0.0.3" });
  await rotating;
  await log.flush();
  const ips = (await readFile(filePath, "utf8")).trim().split("\n").map((line) => JSON.parse(line).ip);
  assert.equal(new Set(ips).size, ips.length, `duplicate lines: ${ips.join(",")}`);

  const restored = createAccessLog({ filePath, maxEntries: 2 });
  await restored.load();
  assert.deepEqual(restored.entries().map((entry: { ip: string }) => entry.ip), ["10.0.0.3", "10.0.0.2"]);
});

test("access log overlapping flushes during a rotation do not write an entry twice", async () => {
  const filePath = await tempLogPath();
  const log = createAccessLog({ filePath, flushDelayMs: 60_000, maxEntries: 2, maxFileBytes: 350 });
  log.record({ type: "browse", event: "items", ip: "10.0.0.1", path: `/api/items?q=${"x".repeat(250)}` });
  await log.flush();
  log.record({ type: "browse", event: "items", ip: "10.0.0.2" });
  const rotating = log.flush();
  log.record({ type: "browse", event: "items", ip: "10.0.0.3" });
  // A second flush queued before the rotation has written its copy of 10.0.0.3.
  const second = log.flush();
  await Promise.all([rotating, second]);
  const ips = (await readFile(filePath, "utf8")).trim().split("\n").map((line) => JSON.parse(line).ip);
  assert.deepEqual(ips, ["10.0.0.2", "10.0.0.3"]);

  const restored = createAccessLog({ filePath, maxEntries: 2 });
  await restored.load();
  assert.deepEqual(restored.entries().map((entry: { ip: string }) => entry.ip), ["10.0.0.3", "10.0.0.2"]);
});

test("access log keeps an event recorded right after clear while earlier writes are queued", async () => {
  const filePath = await tempLogPath();
  const log = createAccessLog({ filePath, flushDelayMs: 60_000 });
  log.record({ type: "browse", event: "items", ip: "10.0.0.1" });
  const before = log.flush();
  const clearing = log.clear();
  log.record({ type: "browse", event: "items", ip: "10.0.0.2" });
  const after = log.flush();
  await Promise.all([before, clearing, after]);
  const ips = (await readFile(filePath, "utf8")).trim().split("\n").map((line) => JSON.parse(line).ip);
  assert.deepEqual(ips, ["10.0.0.2"]);

  const restored = createAccessLog({ filePath });
  await restored.load();
  assert.deepEqual(restored.entries().map((entry: { ip: string }) => entry.ip), ["10.0.0.2"]);
});

test("access log drops what it was reading when clear runs during load", async () => {
  const filePath = await tempLogPath();
  const writer = createAccessLog({ filePath });
  writer.record({ type: "view", event: "view", ip: "10.0.0.1" });
  await writer.flush();

  const log = createAccessLog({ filePath });
  const loading = log.load();
  const clearing = log.clear();
  log.record({ type: "browse", event: "items", ip: "10.0.0.2" });
  await Promise.all([loading, clearing, log.flush()]);
  assert.deepEqual(log.entries().map((entry: { ip: string }) => entry.ip), ["10.0.0.2"]);
  const ips = (await readFile(filePath, "utf8")).trim().split("\n").map((line) => JSON.parse(line).ip);
  assert.deepEqual(ips, ["10.0.0.2"]);
});

test("access log load waits for a removal queued by an earlier clear", async () => {
  const filePath = await tempLogPath();
  const writer = createAccessLog({ filePath });
  writer.record({ type: "view", event: "view", ip: "10.0.0.1" });
  await writer.flush();

  const log = createAccessLog({ filePath });
  // A queued append keeps the removal from running before load starts reading.
  log.record({ type: "browse", event: "items", ip: "10.0.0.2" });
  const flushing = log.flush();
  const clearing = log.clear();
  const loading = log.load();
  await Promise.all([flushing, clearing, loading]);
  assert.deepEqual(log.entries(), []);
  await assert.rejects(readFile(filePath, "utf8"));
});

test("access log first load does not restore events this run already wrote", async () => {
  const filePath = await tempLogPath();
  const earlier = createAccessLog({ filePath });
  earlier.record({ type: "view", event: "view", ip: "10.0.0.1" });
  await earlier.flush();

  const log = createAccessLog({ filePath });
  log.record({ type: "browse", event: "items", ip: "10.0.0.2" });
  const flushing = log.flush();
  const loading = log.load();
  await Promise.all([flushing, loading]);
  await log.flush();
  assert.deepEqual(log.entries().map((entry: { ip: string }) => entry.ip).sort(), ["10.0.0.1", "10.0.0.2"]);
  const ips = (await readFile(filePath, "utf8")).trim().split("\n").map((line) => JSON.parse(line).ip);
  assert.deepEqual(ips.sort(), ["10.0.0.1", "10.0.0.2"]);
});

test("access log first flush keeps an earlier run's entries before rotating", async () => {
  const filePath = await tempLogPath();
  const earlier = createAccessLog({ filePath });
  earlier.record({ type: "view", event: "view", ip: "10.0.0.1" });
  await earlier.flush();

  // The new events alone exceed the file limit, and flush is called before any explicit load.
  const log = createAccessLog({ filePath, flushDelayMs: 60_000, maxFileBytes: 350 });
  log.record({ type: "browse", event: "items", ip: "10.0.0.2", path: `/api/items?q=${"x".repeat(150)}` });
  log.record({ type: "browse", event: "items", ip: "10.0.0.3", path: `/api/items?q=${"y".repeat(150)}` });
  await log.flush();
  await log.load();
  assert.deepEqual(log.entries().map((entry: { ip: string }) => entry.ip).sort(), ["10.0.0.1", "10.0.0.2", "10.0.0.3"]);
  const ips = (await readFile(filePath, "utf8")).trim().split("\n").map((line) => JSON.parse(line).ip);
  assert.deepEqual(ips.sort(), ["10.0.0.1", "10.0.0.2", "10.0.0.3"]);
});

test("access log shares one restoration when the first load overlaps a large flush", async () => {
  const filePath = await tempLogPath();
  const earlier = createAccessLog({ filePath });
  earlier.record({ type: "view", event: "view", ip: "10.0.0.1" });
  await earlier.flush();

  const log = createAccessLog({ filePath, maxFileBytes: 200 });
  const loading = log.load();
  log.record({ type: "browse", event: "items", ip: "10.0.0.2", path: `/api/items?q=${"x".repeat(200)}` });
  await Promise.all([loading, log.flush()]);

  assert.deepEqual(log.entries().map((entry: { ip: string }) => entry.ip).sort(), ["10.0.0.1", "10.0.0.2"]);
  const ips = (await readFile(filePath, "utf8")).trim().split("\n").map((line) => JSON.parse(line).ip);
  assert.deepEqual(ips.sort(), ["10.0.0.1", "10.0.0.2"]);
});

test("access log summary lists failed views without counting them as views", async () => {
  const filePath = await tempLogPath();
  const now = Date.UTC(2026, 10, 3, 12);
  const log = createAccessLog({ filePath, now: () => now });
  log.record({ type: "view", event: "view", ip: "10.0.0.1", user: "alice", status: 200, at: now - 1000 });
  log.record({ type: "view", event: "view_failed", ip: "10.0.0.1", user: "alice", status: 404, at: now - 500 });
  const summary = log.summary();
  assert.equal(summary.totals.view, 1);
  assert.equal(summary.totals.viewFailures, 1);
  assert.equal(summary.buckets.reduce((sum: number, bucket: { view: number }) => sum + bucket.view, 0), 1);
  // The chart's buckets still add up to every request: the failure is kept in its own count.
  assert.equal(summary.buckets.reduce((sum: number, bucket: { viewFailures: number }) => sum + bucket.viewFailures, 0), 1);
  assert.equal(summary.clients[0].views, 1);
  assert.equal(log.entries({ type: "view" }).length, 2);
});

test("access log does not show refused requests as connected", async () => {
  const filePath = await tempLogPath();
  const now = Date.UTC(2026, 10, 3, 12);
  const log = createAccessLog({ filePath, now: () => now });
  log.record({ type: "auth", event: "blocked", ip: "10.0.0.9", status: 403 });
  log.record({ type: "auth", event: "login_failure", ip: "10.0.0.8", user: "bob", status: 401 });
  assert.equal(log.activeClients(), 0);
  const summary = log.summary();
  assert.equal(summary.activeClients, 0);
  assert.ok(summary.clients.every((client: { active: boolean }) => !client.active));
  assert.equal(summary.clientCount, 2);
});

test("access log devices count only the selected range", async () => {
  const filePath = await tempLogPath();
  const now = Date.UTC(2026, 10, 3, 12, 30);
  const log = createAccessLog({ filePath, now: () => now });
  log.record({ type: "view", event: "view", ip: "10.0.0.1", user: "alice", status: 200, at: now - 3 * HOUR });
  log.record({ type: "view", event: "view", ip: "10.0.0.1", user: "alice", status: 200, at: now - 10 * 60 * 1000 });
  log.record({ type: "view", event: "view", ip: "10.0.0.2", user: "bob", status: 200, at: now - 5 * HOUR });
  const hour = log.summary({ range: "1h" });
  assert.equal(hour.totals.view, 1);
  assert.deepEqual(hour.clients.map((client: { ip: string; views: number }) => [client.ip, client.views]), [["10.0.0.1", 1]]);
  const day = log.summary({ range: "24h" });
  assert.deepEqual(day.clients.map((client: { ip: string; views: number }) => [client.ip, client.views]), [["10.0.0.1", 2], ["10.0.0.2", 1]]);
});

test("access log measures the file limit in bytes", async () => {
  const filePath = await tempLogPath();
  // Each entry is about 60 characters but over 200 bytes in UTF-8, so two of them pass a 400-byte limit.
  const log = createAccessLog({ filePath, flushDelayMs: 60_000, maxEntries: 1, maxFileBytes: 400 });
  log.record({ type: "browse", event: "search", ip: "10.0.0.1", path: `/api/items?q=${"風".repeat(60)}` });
  await log.flush();
  log.record({ type: "browse", event: "search", ip: "10.0.0.2", path: `/api/items?q=${"景".repeat(60)}` });
  await log.flush();
  const lines = (await readFile(filePath, "utf8")).trim().split("\n");
  assert.deepEqual(lines.map((line) => JSON.parse(line).ip), ["10.0.0.2"]);
});

test("access log forgets the device seen longest ago when presence is full", () => {
  let now = Date.UTC(2026, 10, 3, 12);
  const log = createAccessLog({ filePath: join(tmpdir(), "unused-access-log.jsonl"), now: () => now });
  for (let index = 0; index < 2000; index += 1) log.touch(`10.0.${Math.floor(index / 250)}.${index % 250}`);
  // Seen again, so it is no longer the oldest.
  log.touch("10.0.0.0");
  log.touch("192.168.1.1");
  const ips = log.summary({ clientLimit: 5000 }).clients.map((client: { ip: string }) => client.ip);
  assert.equal(ips.length, 2000);
  assert.ok(ips.includes("10.0.0.0"));
  assert.ok(!ips.includes("10.0.0.1"));
  assert.ok(ips.includes("192.168.1.1"));
});

test("access log shows the unsigned row when only it is connected on an address", async () => {
  const filePath = await tempLogPath();
  let now = Date.UTC(2026, 10, 3, 12);
  const log = createAccessLog({ filePath, now: () => now });
  log.record({ type: "auth", event: "login_success", ip: "10.0.0.5", user: "alice", status: 200 });
  log.touch("10.0.0.5", "");
  // While alice is connected, the unsigned poll adds no row of its own.
  assert.deepEqual(log.summary().clients.map((client: { user: string }) => client.user), ["alice"]);

  now += 3 * 60 * 1000;
  log.touch("10.0.0.5", "");
  const summary = log.summary();
  assert.equal(summary.activeClients, 1);
  assert.deepEqual(summary.clients.map((client: { user: string; active: boolean }) => [client.user, client.active]).sort(), [["", true], ["alice", false]]);
});

test("access log keeps server events out of devices and connected counts", async () => {
  const filePath = await tempLogPath();
  const now = Date.UTC(2026, 10, 3, 12);
  const log = createAccessLog({ filePath, now: () => now });
  log.record({ type: "system", event: "server_start", ip: "this computer" });
  log.record({ type: "system", event: "settings_changed", ip: "this computer", fields: ["port", "authUsers"] });
  log.record({ type: "edit", event: "star", ip: "10.0.0.1", user: "alice", itemId: "I1", libraryId: "lib-a", fields: ["rating"], status: 200 });
  const summary = log.summary();
  assert.equal(log.activeClients(), 1);
  assert.deepEqual(summary.clients.map((client: { ip: string; edits: number }) => [client.ip, client.edits]), [["10.0.0.1", 1]]);
  assert.equal(summary.totals.system, 2);
  assert.equal(summary.totals.edit, 1);
  await log.flush();
  const restored = createAccessLog({ filePath, now: () => now });
  await restored.load();
  const recent = restored.entries({ limit: 2 });
  assert.deepEqual(recent[0].fields, ["rating"]);
  assert.equal(recent[0].libraryId, "lib-a");
  assert.deepEqual(restored.entries({ type: "system" })[0].fields, ["port", "authUsers"]);
  const csv = accessLogCsv([recent[1]]);
  assert.match(csv.split("\n")[1], /settings_changed,this computer,,,,,,port authUsers,/);
});

test("access log summary ignores successful browsing left over from older logs", async () => {
  const filePath = await tempLogPath();
  const now = Date.UTC(2026, 10, 3, 12);
  const log = createAccessLog({ filePath, now: () => now });
  log.record({ type: "browse", event: "search", ip: "10.0.0.7", status: 200, at: now - 1000 });
  log.record({ type: "browse", event: "folders", ip: "10.0.0.8", status: 502, at: now - 1000 });
  const summary = log.summary();
  assert.equal(summary.totals.browse, 1);
  assert.equal(summary.buckets.reduce((sum: number, bucket: { browse: number }) => sum + bucket.browse, 0), 1);
});

test("access log counts a refused edit as failed, not as an edit", async () => {
  const filePath = await tempLogPath();
  const now = Date.UTC(2026, 10, 3, 12);
  const log = createAccessLog({ filePath, now: () => now });
  log.record({ type: "edit", event: "star", ip: "10.0.0.1", user: "alice", status: 200, at: now - 1000 });
  log.record({ type: "edit", event: "trash", ip: "10.0.0.1", user: "alice", status: 403, at: now - 500 });
  const summary = log.summary();
  assert.equal(summary.totals.edit, 1);
  assert.equal(summary.totals.editFailures, 1);
  assert.equal(summary.buckets.reduce((sum: number, bucket: { edit: number }) => sum + bucket.edit, 0), 1);
  assert.equal(summary.buckets.reduce((sum: number, bucket: { editFailures: number }) => sum + bucket.editFailures, 0), 1);
  assert.deepEqual([summary.clients[0].edits, summary.clients[0].editFailures], [1, 1]);
  assert.equal(log.entries({ type: "edit" }).length, 2);
});
