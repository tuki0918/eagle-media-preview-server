import { describe, expect, test } from "vitest";
import { serverRestartSettingsChanged, settingsPayloadChanged } from "./settingsChange";

const baseSettings = {
  authEnabled: false,
  authUsers: [{ username: "eagle", passwordHash: "", role: "viewer" }],
  autoStart: false,
  host: "127.0.0.1",
  httpsCertPath: "",
  httpsEnabled: false,
  httpsKeyPath: "",
  port: 41532,
  sessionDurationDays: 7,
};

describe("settingsChange", () => {
  test("treats auto start as a persisted setting that does not restart the server", () => {
    expect(settingsPayloadChanged(baseSettings, { autoStart: true })).toBe(true);
    expect(serverRestartSettingsChanged(baseSettings, { autoStart: true })).toBe(false);
  });

  test("requires a restart for listener and session settings", () => {
    expect(serverRestartSettingsChanged(baseSettings, { host: "0.0.0.0" })).toBe(true);
    expect(serverRestartSettingsChanged(baseSettings, { port: 41533 })).toBe(true);
    expect(serverRestartSettingsChanged(baseSettings, { httpsEnabled: true })).toBe(true);
    expect(serverRestartSettingsChanged(baseSettings, { sessionDurationDays: 14 })).toBe(true);
  });

  test("ignores auth user edits while password protection stays disabled", () => {
    expect(serverRestartSettingsChanged(baseSettings, {
      authUsers: [{ username: "new-user", passwordHash: "", role: "viewer" }],
    })).toBe(false);
  });

  test("requires a restart for enabled auth users and password updates", () => {
    const current = {
      ...baseSettings,
      authEnabled: true,
      authUsers: [{ username: "eagle", passwordHash: "old", role: "viewer" }],
    };

    expect(serverRestartSettingsChanged(current, {
      authUsers: [{ username: "eagle", passwordHash: "old", role: "editor" }],
    })).toBe(true);
    expect(serverRestartSettingsChanged(current, { userPasswords: { eagle: "secret123" } })).toBe(true);
  });
});
