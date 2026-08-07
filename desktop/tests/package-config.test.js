import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";


const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));


describe("desktop package configuration", () => {
  it("includes the Python runtime resolver imported by the Electron main process", () => {
    expect(packageJson.build.files).toContain("scripts/python-runtime.mjs");
    expect(packageJson.build.asarUnpack).toContain("scripts/python-runtime.mjs");
  });

  it("builds and includes the standalone Python backend", () => {
    expect(packageJson.scripts["desktop:pack"]).toContain("npm run backend:pack");
    expect(packageJson.build.extraResources).toContainEqual({
      from: "build/python/revomail-backend",
      to: "python-backend",
    });
  });
});
