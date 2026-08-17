import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePythonCommand } from "./python-runtime.mjs";
import { pruneGoogleDiscoveryDocuments } from "./prune-python-backend.mjs";


const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const python = resolvePythonCommand(projectRoot);
const args = [
  "-m", "PyInstaller",
  "--noconfirm",
  "--clean",
  "--onedir",
  "--name", "revomail-backend",
  "--distpath", path.join(projectRoot, "build", "python"),
  "--workpath", path.join(projectRoot, "build", "pyinstaller", "work"),
  "--specpath", path.join(projectRoot, "build", "pyinstaller"),
  path.join(projectRoot, "backend", "run.py"),
];

const child = spawn(python, args, {
  cwd: projectRoot,
  env: process.env,
  stdio: "inherit",
  windowsHide: true,
});

child.once("error", (error) => {
  console.error(`Unable to package the Python backend: ${error.message}`);
  process.exit(1);
});
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  if (code !== 0) process.exit(code ?? 1);
  try {
    const result = pruneGoogleDiscoveryDocuments(path.join(projectRoot, "build", "python", "revomail-backend"));
    console.log(`Pruned ${result.removedFiles} unused Google discovery documents (${result.removedBytes} bytes).`);
    process.exit(0);
  } catch (error) {
    console.error(`Unable to prune the standalone backend: ${error.message}`);
    process.exit(1);
  }
});
