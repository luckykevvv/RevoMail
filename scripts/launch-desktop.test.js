import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { launchDesktop, lockFingerprint, nodeDependenciesAreCurrent } from "./launch-desktop.mjs";


const temporaryDirectories = [];


function createProject() {
  const projectRoot = mkdtempSync(path.join(os.tmpdir(), "revomail-launch-"));
  temporaryDirectories.push(projectRoot);
  writeFileSync(path.join(projectRoot, "package-lock.json"), "lock-content", "utf8");
  return projectRoot;
}


afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});


describe("root desktop launcher", () => {
  it("installs stale dependencies before launching Electron", () => {
    const projectRoot = createProject();
    const calls = [];
    const spawnSyncImpl = (command, args) => {
      calls.push({ command, args });
      if (args[0] === "ci") {
        mkdirSync(path.join(projectRoot, "node_modules", "electron"), { recursive: true });
        writeFileSync(path.join(projectRoot, "node_modules", "electron", "package.json"), "{}", "utf8");
      }
      return { status: 0 };
    };

    launchDesktop({ projectRoot, platform: "win32", spawnSyncImpl });

    expect(calls).toEqual([
      { command: "npm.cmd", args: ["ci"] },
      { command: "npm.cmd", args: ["run", "desktop"] },
    ]);
    expect(nodeDependenciesAreCurrent(
      projectRoot,
      lockFingerprint(path.join(projectRoot, "package-lock.json"))
    )).toBe(true);
  });

  it("skips installation when the lock fingerprint and Electron are current", () => {
    const projectRoot = createProject();
    const nodeModules = path.join(projectRoot, "node_modules");
    mkdirSync(path.join(nodeModules, "electron"), { recursive: true });
    writeFileSync(path.join(nodeModules, "electron", "package.json"), "{}", "utf8");
    writeFileSync(
      path.join(nodeModules, ".revomail-lock.sha256"),
      lockFingerprint(path.join(projectRoot, "package-lock.json")),
      "utf8"
    );
    const calls = [];

    launchDesktop({
      projectRoot,
      platform: "win32",
      spawnSyncImpl: (command, args) => {
        calls.push({ command, args });
        return { status: 0 };
      },
    });

    expect(calls).toEqual([{ command: "npm.cmd", args: ["run", "desktop"] }]);
  });
});
