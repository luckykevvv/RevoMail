import path from "node:path";
import { describe, expect, it } from "vitest";

import { pythonCandidates, resolvePythonCommand } from "./python-runtime.mjs";


describe("Python runtime selection", () => {
  it("checks a bundled runtime before the repository virtual environment", () => {
    const candidates = pythonCandidates("C:\\RevoMail", "win32");
    expect(candidates[0]).toBe(path.join("C:\\RevoMail", "runtime", "python", "python.exe"));
    expect(candidates[1]).toBe(path.join("C:\\RevoMail", ".venv", "Scripts", "python.exe"));
  });

  it("prefers the repository virtual environment when present", () => {
    const executable = process.platform === "win32" ? ["Scripts", "python.exe"] : ["bin", "python"];
    expect(resolvePythonCommand(process.cwd())).toBe(path.join(process.cwd(), ".venv", ...executable));
  });
});
