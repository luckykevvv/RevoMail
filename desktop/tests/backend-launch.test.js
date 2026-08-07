import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveBackendLaunch } from "../backend-launch.js";


describe("backend launch resolution", () => {
  it("uses the bundled backend executable in a packaged Windows app", () => {
    expect(resolveBackendLaunch({
      isPackaged: true,
      resourcesPath: "C:\\RevoMail\\resources",
      projectRoot: "C:\\RevoMail\\resources\\app.asar.unpacked",
      platform: "win32",
    })).toEqual({
      command: path.join("C:\\RevoMail\\resources", "python-backend", "revomail-backend.exe"),
      commandArgs: [],
    });
  });

  it("uses the repository Python module during development", () => {
    const launch = resolveBackendLaunch({
      isPackaged: false,
      resourcesPath: "C:\\RevoMail\\resources",
      projectRoot: process.cwd(),
      platform: "win32",
    });
    expect(launch.commandArgs).toEqual(["-m", "backend.run"]);
    expect(launch.command).toMatch(/python(?:\.exe)?$/i);
  });
});
