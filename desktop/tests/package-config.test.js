import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";


const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));


describe("desktop package configuration", () => {
  it("bootstraps the Python environment during install and source launches", () => {
    expect(packageJson.scripts.postinstall).toBe("npm run setup");
    expect(packageJson.scripts.predesktop).toBe("npm run setup");
    expect(packageJson.scripts["predesktop:dev"]).toBe("npm run setup");
    expect(packageJson.scripts.prestart).toBe("npm run setup");
    expect(packageJson.scripts["prebackend:pack"]).toBe("npm run setup");
    expect(packageJson.scripts["desktop:root"]).toContain("scripts/copy-root-desktop.mjs");
    expect(packageJson.scripts["verify:push"]).toContain("npm run desktop:root");
    expect(packageJson.scripts["verify:push"]).toContain("npm run desktop:smoke");
    expect(packageJson.scripts["verify:push"]).toContain("npm run desktop:root-smoke");
    expect(packageJson.build.win.target).toBe("portable");
  });

  it("includes the Python runtime resolver imported by the Electron main process", () => {
    expect(packageJson.build.files).toContain("scripts/python-runtime.mjs");
    expect(packageJson.build.asarUnpack).not.toContain("scripts/python-runtime.mjs");
  });

  it("builds and includes the standalone Python backend", () => {
    expect(packageJson.scripts["desktop:pack"]).toContain("npm run backend:pack");
    expect(packageJson.build.extraResources).toContainEqual({
      from: "build/python/revomail-backend",
      to: "python-backend",
    });
  });

  it("keeps only runtime files and supported Electron locales in the package", () => {
    expect(packageJson.build.asarUnpack).toEqual(["dist/**/*"]);
    expect(packageJson.build.files).not.toContain("backend/**/*");
    expect(packageJson.build.files).not.toContain("server.js");
    expect(packageJson.build.electronLanguages).toEqual(["en-US", "zh-CN"]);
    expect(packageJson.dependencies).toEqual({
      dotenv: "^16.4.7",
      zod: "^4.4.3",
    });
  });
});
