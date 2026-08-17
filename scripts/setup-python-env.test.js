import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  basePythonCandidates,
  ensurePythonEnvironment,
  environmentIsCurrent,
  requirementsFingerprint,
  venvPythonPath,
} from "./setup-python-env.mjs";


const temporaryDirectories = [];


afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});


describe("Python environment setup", () => {
  it("uses the Windows py launcher before PATH aliases", () => {
    expect(basePythonCandidates("win32")).toEqual([
      { command: "py", args: ["-3"] },
      { command: "python", args: [] },
      { command: "python3", args: [] },
    ]);
  });

  it("invalidates the environment when requirements change", () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), "revomail-setup-"));
    temporaryDirectories.push(projectRoot);
    const requirementsDirectory = path.join(projectRoot, "backend");
    const python = venvPythonPath(projectRoot, "win32");
    mkdirSync(requirementsDirectory, { recursive: true });
    mkdirSync(path.dirname(python), { recursive: true });
    writeFileSync(python, "placeholder", "utf8");
    const requirementsPath = path.join(requirementsDirectory, "requirements.txt");
    writeFileSync(requirementsPath, "fastapi==1\n", "utf8");
    const fingerprint = requirementsFingerprint(requirementsPath);
    writeFileSync(
      path.join(projectRoot, ".venv", ".revomail-environment.json"),
      JSON.stringify({ requirementsSha256: fingerprint }),
      "utf8"
    );

    expect(environmentIsCurrent(projectRoot, fingerprint, "win32")).toBe(true);
    expect(environmentIsCurrent(projectRoot, "different", "win32")).toBe(false);
  });

  it("creates a missing environment and installs requirements", () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), "revomail-setup-"));
    temporaryDirectories.push(projectRoot);
    const requirementsDirectory = path.join(projectRoot, "backend");
    const python = venvPythonPath(projectRoot, "win32");
    mkdirSync(requirementsDirectory, { recursive: true });
    writeFileSync(path.join(requirementsDirectory, "requirements.txt"), "fastapi==1\n", "utf8");
    const calls = [];
    const spawnSyncImpl = (command, args) => {
      calls.push({ command, args });
      if (args.includes("venv")) {
        mkdirSync(path.dirname(python), { recursive: true });
        writeFileSync(python, "placeholder", "utf8");
      }
      return { status: 0 };
    };

    const result = ensurePythonEnvironment({ projectRoot, platform: "win32", spawnSyncImpl });

    expect(result).toEqual({ python, changed: true });
    expect(calls[0]).toEqual({ command: "py", args: ["-3", "--version"] });
    expect(calls[1].args).toContain("venv");
    expect(calls[2]).toEqual({
      command: python,
      args: [
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "-r",
        path.join(requirementsDirectory, "requirements.txt"),
      ],
    });
    expect(environmentIsCurrent(
      projectRoot,
      requirementsFingerprint(path.join(requirementsDirectory, "requirements.txt")),
      "win32"
    )).toBe(true);
  });
});
