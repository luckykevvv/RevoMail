import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_DESKTOP_SETTINGS, DesktopSettingsStore } from "../settings-store.js";

const temporaryDirectories = [];

function createStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "revomail-desktop-"));
  temporaryDirectories.push(directory);
  return new DesktopSettingsStore(path.join(directory, "settings.json"));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("DesktopSettingsStore", () => {
  it("uses safe local defaults", () => {
    expect(createStore().get()).toEqual(DEFAULT_DESKTOP_SETTINGS);
  });

  it("validates and persists supported settings", () => {
    const store = createStore();
    const updated = store.update({ port: 43173, theme: "dark", autoStart: true });
    expect(updated).toMatchObject({ port: 43173, theme: "dark", autoStart: true });
    expect(new DesktopSettingsStore(store.filePath).get()).toEqual(updated);
  });

  it("rejects unsafe hosts and invalid ports", () => {
    const store = createStore();
    expect(() => store.update({ host: "0.0.0.0" })).toThrow();
    expect(() => store.update({ port: 80 })).toThrow();
  });

  it("recovers safe defaults from malformed data", () => {
    const store = createStore();
    fs.writeFileSync(store.filePath, "not-json", "utf8");
    expect(new DesktopSettingsStore(store.filePath).get()).toEqual(DEFAULT_DESKTOP_SETTINGS);
  });
});
