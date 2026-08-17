import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  configureDesktopBackendEnvironment,
  desktopEnvironmentCandidates,
  loadDesktopEnvironment,
} from "../runtime-environment.js";


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

  it("configures packaged backend persistence and production secrets outside the renderer", () => {
    const env = { SECRET_KEY: "configured-secret" };
    const ensureKey = vi.fn(() => "generated-server-key");
    const userDataPath = "C:\\Users\\tester\\AppData\\Roaming\\RevoMail";

    configureDesktopBackendEnvironment(
      { isPackaged: true, userDataPath },
      { env, ensureKey }
    );

    expect(env.DATABASE_URL).toBe("file:C:/Users/tester/AppData/Roaming/RevoMail/revomail.db");
    expect(env.TOKEN_ENCRYPTION_KEY).toBe("generated-server-key");
    expect(env.SECRET_KEY).toBe("configured-secret");
    expect(env.REVOMAIL_ENV).toBe("production");
    expect(ensureKey).toHaveBeenCalledWith(path.join(userDataPath, "server.key"));
  });
});
