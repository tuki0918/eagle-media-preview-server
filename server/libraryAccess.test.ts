import { test } from "vitest";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createLibraryAccessPolicy, libraryPathKey, normalizeSharedLibraries } = require("../dist/.generated/plugin-service/libraryAccess.cjs");

test("libraryPathKey ignores trailing separators and follows platform case rules", () => {
  assert.equal(libraryPathKey("/Users/me/A.library/", "linux"), "/Users/me/A.library");
  assert.equal(libraryPathKey("/Users/me/A.library", "darwin"), "/users/me/a.library");
  assert.equal(libraryPathKey("C:/Media/A.library\\", "win32"), "c:\\media\\a.library");
  assert.equal(libraryPathKey("", "linux"), "");
});

test("createLibraryAccessPolicy shares everything when protection is off", () => {
  const policy = createLibraryAccessPolicy(null, [], "linux");
  assert.equal(policy.status("/Users/me/A.library"), "unrestricted");
});

test("createLibraryAccessPolicy only shares listed libraries and fails closed on unknown paths", () => {
  const policy = createLibraryAccessPolicy(["/Users/me/A.library/"], [], "linux");
  assert.equal(policy.status("/Users/me/A.library"), "shared");
  assert.equal(policy.status("/Users/me/B.library"), "not_shared");
  assert.equal(policy.status(""), "not_shared");
  assert.equal(policy.status(undefined), "not_shared");
});

test("createLibraryAccessPolicy shares nothing when protection is on with an empty list", () => {
  const policy = createLibraryAccessPolicy([], [], "linux");
  assert.equal(policy.status("/Users/me/A.library"), "not_shared");
});

test("normalizeSharedLibraries de-duplicates by normalized path", () => {
  assert.deepEqual(normalizeSharedLibraries([
    { path: "/Users/me/A.library", name: "Main" },
    { path: "/users/me/a.library/" },
  ], "darwin"), [{ path: "/Users/me/A.library", name: "Main" }]);
});

test("createLibraryAccessPolicy limits a shared library to its users, admins always allowed", () => {
  const policy = createLibraryAccessPolicy(["/L/A.library", "/L/B.library"], [{ path: "/L/A.library", users: ["alice"] }, { path: "/L/C.library", users: ["alice"] }], "linux");
  assert.equal(policy.status("/L/A.library", { username: "alice", role: "viewer" }), "shared");
  assert.equal(policy.status("/L/A.library", { username: "bob", role: "viewer" }), "forbidden");
  assert.equal(policy.status("/L/A.library", { username: "owner", role: "admin" }), "shared");
  assert.equal(policy.status("/L/A.library", null), "forbidden");
  // Without a user argument the rules are skipped (public status before sign-in).
  assert.equal(policy.status("/L/A.library"), "shared");
  assert.equal(policy.status("/L/B.library", { username: "bob", role: "viewer" }), "shared");
  // A rule for an unshared library never shares it.
  assert.equal(policy.status("/L/C.library", { username: "alice", role: "viewer" }), "not_shared");
});

test("normalizeSharedLibraries keeps a limited library's users, and an empty list stays limited", () => {
  assert.deepEqual(normalizeSharedLibraries([
    { path: "/L/A.library", name: "A", access: "selected", users: ["alice", " alice ", "", "bob"] },
    { path: "/L/B.library", name: "B", access: "selected" },
    { path: "/L/C.library", name: "C", access: "all", users: ["alice"] },
  ], "linux"), [
    { path: "/L/A.library", name: "A", access: "selected", users: ["alice", "bob"] },
    { path: "/L/B.library", name: "B", access: "selected", users: [] },
    { path: "/L/C.library", name: "C" },
  ]);
});
