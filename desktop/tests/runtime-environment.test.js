import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { desktopEnvironmentCandidates, loadDesktopEnvironment } from "../runtime-environment.js";


describe("desktop environment loading", () => {
  it("checks private user data before the local workspace for a packaged build", () => {
    expect(desktopEnvironmentCandidates({
      isPackaged: true,
      resourcesPath: "C:\\RevoMail\\release\\win-unpacked\\resources",
      projectRoot: "C:\\RevoMail\\release\\win-unpacked\\resources\\app.asar.unpacked",
      userDataPath: "C:\\Users\\tester\\AppData\\Roaming\\RevoMail",
    })).toEqual([
      path.join("C:\\Users\\tester\\AppData\\Roaming\\RevoMail", ".env"),
      path.join("C:\\RevoMail", ".env"),
    ]);
  });

  it("loads only existing files without overriding process variables", () => {
    const load = vi.fn();
    const options = {
      isPackaged: false,
      resourcesPath: "C:\\RevoMail\\resources",
      projectRoot: "C:\\RevoMail",
      userDataPath: "C:\\Users\\tester\\AppData\\Roaming\\RevoMail",
    };
    const workspaceEnv = path.join(options.projectRoot, ".env");
    expect(loadDesktopEnvironment(options, {
      exists: (candidate) => candidate === workspaceEnv,
      load,
    })).toEqual([workspaceEnv]);
    expect(load).toHaveBeenCalledWith({ path: workspaceEnv, override: false });
  });
});
