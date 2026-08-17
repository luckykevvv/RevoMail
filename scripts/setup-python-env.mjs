import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";


const STAMP_NAME = ".revomail-environment.json";


export function venvPythonPath(projectRoot, platform = process.platform) {
  return platform === "win32"
    ? path.join(projectRoot, ".venv", "Scripts", "python.exe")
    : path.join(projectRoot, ".venv", "bin", "python");
}


export function basePythonCandidates(platform = process.platform) {
  return platform === "win32"
    ? [
        { command: "py", args: ["-3"] },
        { command: "python", args: [] },
        { command: "python3", args: [] },
      ]
    : [
        { command: "python3", args: [] },
        { command: "python", args: [] },
      ];
}


export function requirementsFingerprint(requirementsPath) {
  return createHash("sha256").update(readFileSync(requirementsPath)).digest("hex");
}


export function environmentIsCurrent(projectRoot, fingerprint, platform = process.platform) {
  const python = venvPythonPath(projectRoot, platform);
  const stampPath = path.join(projectRoot, ".venv", STAMP_NAME);
  if (!existsSync(python) || !existsSync(stampPath)) return false;
  try {
    return JSON.parse(readFileSync(stampPath, "utf8")).requirementsSha256 === fingerprint;
  } catch {
    return false;
  }
}


function findBasePython(platform, spawnSyncImpl) {
  for (const candidate of basePythonCandidates(platform)) {
    const result = spawnSyncImpl(candidate.command, [...candidate.args, "--version"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (!result.error && result.status === 0) return candidate;
  }
  return null;
}


function runChecked(spawnSyncImpl, command, args, label) {
  const result = spawnSyncImpl(command, args, {
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} (exit code ${result.status ?? "unknown"})`);
}


export function ensurePythonEnvironment({
  projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  platform = process.platform,
  spawnSyncImpl = spawnSync,
} = {}) {
  const requirementsPath = path.join(projectRoot, "backend", "requirements.txt");
  const venvDirectory = path.join(projectRoot, ".venv");
  const python = venvPythonPath(projectRoot, platform);
  const fingerprint = requirementsFingerprint(requirementsPath);

  if (environmentIsCurrent(projectRoot, fingerprint, platform)) {
    console.log("RevoMail Python environment is ready.");
    return { python, changed: false };
  }

  if (!existsSync(python)) {
    const basePython = findBasePython(platform, spawnSyncImpl);
    if (!basePython) {
      throw new Error(
        "Python 3.11 or newer was not found. Install Python, enable the Windows py launcher or PATH entry, then run npm install again."
      );
    }
    console.log("Creating the RevoMail Python environment...");
    runChecked(
      spawnSyncImpl,
      basePython.command,
      [...basePython.args, "-m", "venv", venvDirectory],
      "Unable to create .venv"
    );
  }

  if (!existsSync(python)) throw new Error(`The virtual environment did not create ${python}.`);

  console.log("Installing RevoMail Python dependencies...");
  runChecked(
    spawnSyncImpl,
    python,
    ["-m", "pip", "install", "--disable-pip-version-check", "-r", requirementsPath],
    "Unable to install Python dependencies"
  );
  mkdirSync(venvDirectory, { recursive: true });
  writeFileSync(
    path.join(venvDirectory, STAMP_NAME),
    `${JSON.stringify({ requirementsSha256: fingerprint }, null, 2)}\n`,
    "utf8"
  );
  console.log("RevoMail Python environment is ready.");
  return { python, changed: true };
}


if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    ensurePythonEnvironment();
  } catch (error) {
    console.error(`RevoMail environment setup failed: ${error.message}`);
    process.exit(1);
  }
}
