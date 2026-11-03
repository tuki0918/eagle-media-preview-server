import { test } from "vitest";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createAddressBlockList, normalizeBlockedAddress, normalizeBlockedAddresses } = require("../../dist/.generated/plugin-service/addressBlockList.cjs");

test("blocked addresses accept single addresses and CIDR ranges", () => {
  assert.equal(normalizeBlockedAddress(" 192.168.1.50 "), "192.168.1.50");
  assert.equal(normalizeBlockedAddress("::ffff:192.168.1.50"), "192.168.1.50");
  assert.equal(normalizeBlockedAddress("192.168.1.0/24"), "192.168.1.0/24");
  assert.equal(normalizeBlockedAddress("192.168.1.9/32"), "192.168.1.9");
  assert.equal(normalizeBlockedAddress("FD00::/8"), "fd00::/8");
  for (const invalid of ["", "example.com", "192.168.1.300", "192.168.1.0/33", "10.0.0.0/8/1", "10.0.0.0/x"]) {
    assert.throws(() => normalizeBlockedAddress(invalid), /not an IP address|invalid prefix/, invalid);
  }
});

test("blocked addresses never cover this computer's loopback", () => {
  // Anything overlapping 127.0.0.0/8 counts, not only ranges that contain 127.0.0.1.
  for (const loopback of ["127.0.0.1", "127.0.0.2", "127.0.0.128/25", "127.0.0.0/8", "126.0.0.0/7", "0.0.0.0/0", "::1", "::/0"]) {
    assert.throws(() => normalizeBlockedAddress(loopback), /Loopback/, loopback);
  }
  assert.equal(normalizeBlockedAddress("128.0.0.0/8"), "128.0.0.0/8");
  assert.equal(normalizeBlockedAddress("126.0.0.0/8"), "126.0.0.0/8");
});

test("blocked address settings drop invalid and duplicate entries", () => {
  assert.deepEqual(normalizeBlockedAddresses([
    { address: "10.0.0.5", addedAt: 100 },
    "10.0.0.5",
    "bad",
    "127.0.0.1",
    { address: "10.1.0.0/16" },
  ]), [
    { address: "10.0.0.5", addedAt: 100 },
    { address: "10.1.0.0/16", addedAt: 0 },
  ]);
  assert.deepEqual(normalizeBlockedAddresses(null), []);
});

test("block list matches addresses, ranges, and IPv4-mapped IPv6 forms", () => {
  const list = createAddressBlockList(["192.168.1.50", { address: "10.1.0.0/16", addedAt: 1 }]);
  assert.equal(list.isBlocked("192.168.1.50"), true);
  assert.equal(list.isBlocked("::ffff:192.168.1.50"), true);
  assert.equal(list.isBlocked("10.1.200.3"), true);
  assert.equal(list.isBlocked("192.168.1.51"), false);
  assert.equal(list.isBlocked("127.0.0.1"), false);
  assert.equal(list.isBlocked("unknown"), false);
  list.replace([]);
  assert.equal(list.isBlocked("192.168.1.50"), false);
});
