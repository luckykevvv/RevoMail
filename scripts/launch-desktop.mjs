import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";


const STAMP_NAME = ".revomail-lock.sha256";


export function lockFingerprint(lockPath) {
  return createHash("sha256").update(readFileSync(lockPath)).digest("hex");
}


export function nodeDependenciesAreCurrent(projectRoot, fingerprint) {
  const electronPackage = path.join(projectRoot, "node_modules", "electron", "package.json");
  const stampPath = path.join(projectRoot, "node_modules", STAMP_NAME);
  if (!existsSync(electronPackage) || !existsSync(stampPath)) return false;
  try {
    return readFileSync(stampPath, "utf8").trim() === fingerprint;
  } catch {
    return false;
  }
}


function runChecked(spawnSyncImpl, command, args, label) {
  const result = spawnSyncImpl(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    windowsHide: false,
  });
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} (exit code ${result.status ?? "unknown"})`);
}


export function launchDesktop({
  projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  platform = process.platform,
  spawnSyncImpl = spawnSync,
} = {}) {
  const lockPath = path.join(projectRoot, "package-lock.json");
  const fingerprint = lockFingerprint(lockPath);
  const npm = platform === "win32" ? "npm.cmd" : "npm";

  if (!nodeDependenciesAreCurrent(projectRoot, fingerprint)) {
    console.log("Installing RevoMail application dependencies...");
    const result = spawnSyncImpl(npm, ["ci"], {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
      windowsHide: false,
    });
    if (result.error) throw new Error(`Unable to install application dependencies: ${result.error.message}`);
    if (result.status !== 0) {
      throw new Error(`Unable to install application dependencies (exit code ${result.status ?? "unknown"})`);
    }
    writeFileSync(path.join(projectRoot, "node_modules", STAMP_NAME), `${fingerprint}\n`, "utf8");
  }

  console.log("Starting RevoMail Desktop...");
  const previousDirectory = process.cwd();
  try {
    process.chdir(projectRoot);
    runChecked(spawnSyncImpl, npm, ["run", "desktop"], "Unable to start RevoMail Desktop");
  } finally {
    process.chdir(previousDirectory);
  }
}


if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    launchDesktop();
  } catch (error) {
    console.error(`RevoMail launch failed: ${error.message}`);
    process.exit(1);
  }
}
