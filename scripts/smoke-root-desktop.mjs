import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";


const projectRoot = process.cwd();
const executable = path.join(projectRoot, "RevoMail.exe");
const debuggingPort = 9444;
const smokeUserData = path.join(projectRoot, "build", "root-electron-smoke", String(Date.now()));
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;

if (!fs.existsSync(executable)) throw new Error("Root RevoMail.exe does not exist. Run npm run desktop:root first.");

const child = spawn(executable, [`--remote-debugging-port=${debuggingPort}`, `--user-data-dir=${smokeUserData}`], {
  cwd: projectRoot,
  env: environment,
  stdio: "ignore",
  windowsHide: false,
});

try {
  const deadline = Date.now() + 60_000;
  let launcher;
  let detectedWindowTitle = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`);
      if (response.ok) launcher = (await response.json()).find((target) => target.title === "RevoMail Desktop");
    } catch {
      // The portable executable may still be extracting and opening Electron.
    }
    if (process.platform === "win32") {
      const taskList = spawnSync(
        "tasklist",
        ["/v", "/fo", "csv", "/fi", "IMAGENAME eq RevoMail.exe"],
        { encoding: "utf8", windowsHide: true }
      );
      if (taskList.status === 0 && taskList.stdout.includes("RevoMail Desktop")) {
        detectedWindowTitle = "RevoMail Desktop";
      }
    }
    if (launcher || detectedWindowTitle) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!launcher && !detectedWindowTitle) {
    throw new Error("The root portable executable did not open the RevoMail Desktop launcher.");
  }
  console.log(JSON.stringify({
    executable,
    title: launcher?.title || detectedWindowTitle,
    url: launcher?.url || null,
    detection: launcher ? "devtools" : "window-title",
  }));
} finally {
  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
  } else {
    child.kill("SIGTERM");
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  fs.rmSync(smokeUserData, { recursive: true, force: true });
}
