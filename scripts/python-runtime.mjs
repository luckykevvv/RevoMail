import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";


export function pythonCandidates(projectRoot = process.cwd(), platform = process.platform) {
  return platform === "win32"
    ? [
        path.join(projectRoot, "runtime", "python", "python.exe"),
        path.join(projectRoot, ".venv", "Scripts", "python.exe"),
        "python",
      ]
    : [
        path.join(projectRoot, "runtime", "python", "bin", "python3"),
        path.join(projectRoot, ".venv", "bin", "python"),
        "python3",
        "python",
      ];
}


export function resolvePythonCommand(projectRoot = process.cwd()) {
  const candidates = pythonCandidates(projectRoot);
  return candidates.find((candidate) => !path.isAbsolute(candidate) || existsSync(candidate));
}


if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const child = spawn(resolvePythonCommand(projectRoot), process.argv.slice(2), {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => child.kill(signal));
  }
  child.once("error", (error) => {
    console.error(`Unable to start Python: ${error.message}`);
    process.exit(1);
  });
  child.once("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
}
