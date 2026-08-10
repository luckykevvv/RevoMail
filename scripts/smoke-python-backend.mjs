import { spawn } from "node:child_process";
import path from "node:path";


const projectRoot = process.cwd();
const port = 4199;
const executable = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(projectRoot, "build", "python", "revomail-backend", process.platform === "win32" ? "revomail-backend.exe" : "revomail-backend");
const applicationRoot = process.argv[3] ? path.resolve(process.argv[3]) : projectRoot;
const child = spawn(executable, [], {
  cwd: projectRoot,
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port),
    APP_BASE_URL: `http://127.0.0.1:${port}`,
    REVOMAIL_PROJECT_ROOT: applicationRoot,
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

let output = "";
child.stdout.on("data", (chunk) => { output += String(chunk); });
child.stderr.on("data", (chunk) => { output += String(chunk); });

try {
  const deadline = Date.now() + 20_000;
  let healthy = false;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
      if (response.ok) {
        const body = await response.json();
        const sessionResponse = await fetch(`http://127.0.0.1:${port}/api/v1/auth/session`);
        const session = await sessionResponse.json();
        console.log(JSON.stringify({ health: body, providers: session.providers }));
        healthy = true;
        break;
      }
    } catch {
      // The packaged backend may still be extracting and starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!healthy) throw new Error(`Packaged backend did not become healthy.\n${output}`);
} finally {
  if (child.exitCode === null) child.kill("SIGTERM");
}
