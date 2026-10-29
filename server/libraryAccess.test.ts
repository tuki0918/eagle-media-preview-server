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
  const policy = createLibraryAccessPolicy(null, "linux");
  assert.equal(policy.status("/Users/me/A.library"), "unrestricted");
});

test("createLibraryAccessPolicy only shares listed libraries and fails closed on unknown paths", () => {
  const policy = createLibraryAccessPolicy(["/Users/me/A.library/"], "linux");
  assert.equal(policy.status("/Users/me/A.library"), "shared");
  assert.equal(policy.status("/Users/me/B.library"), "not_shared");
  assert.equal(policy.status(""), "not_shared");
  assert.equal(policy.status(undefined), "not_shared");
});

test("createLibraryAccessPolicy shares nothing when protection is on with an empty list", () => {
  const policy = createLibraryAccessPolicy([], "linux");
  assert.equal(policy.status("/Users/me/A.library"), "not_shared");
});

test("normalizeSharedLibraries de-duplicates by normalized path", () => {
  assert.deepEqual(normalizeSharedLibraries([
    { path: "/Users/me/A.library", name: "Main" },
    { path: "/users/me/a.library/" },
  ], "darwin"), [{ path: "/Users/me/A.library", name: "Main" }]);
});
