import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DEFAULT_SETTINGS,
  createSettingsStore,
  defaultSettingsPath,
  hashPassword,
  normalizeSettings,
} from "./settingsStore.js";

test("defaultSettingsPath uses the product settings directory", () => {
  assert.match(defaultSettingsPath(), /[\\/]\.eagle-media-preview-server[\\/]settings\.json$/);
  assert.equal(defaultSettingsPath().includes(".eagle-api-viewer-plugin"), false);
});

test("normalizeSettings applies plugin defaults and validates port", () => {
  assert.deepEqual(normalizeSettings({}), DEFAULT_SETTINGS);
  assert.equal(DEFAULT_SETTINGS.port, 41532);
  assert.equal(normalizeSettings({ port: "6123" }).port, 6123);
  assert.equal("requestLogEnabled" in normalizeSettings({ requestLogEnabled: false }), false);
  assert.throws(() => normalizeSettings({ port: "70000" }), /port/i);
});

test("settings store hashes new passwords and does not persist plain text", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-settings-"));
  const filePath = join(dir, "settings.json");
  const store = createSettingsStore({ filePath });

  const saved = await store.save({
    authEnabled: true,
    password: "secret-password",
    confirmPassword: "secret-password",
  });

  assert.equal(saved.authEnabled, true);
  assert.equal(saved.passwordHash, hashPassword("secret-password"));

  const raw = await readFile(filePath, "utf8");
  assert.equal(raw.includes("secret-password"), false);
});

test("settings store rejects enabled auth without an existing or new password", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-settings-"));
  const store = createSettingsStore({ filePath: join(dir, "settings.json") });

  await assert.rejects(
    () => store.save({ authEnabled: true }),
    /password/i,
  );
});
