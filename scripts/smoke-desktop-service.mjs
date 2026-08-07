import { spawn } from "node:child_process";
import path from "node:path";
import { resolveBackendLaunch } from "../desktop/backend-launch.js";
import { loadDesktopEnvironment } from "../desktop/runtime-environment.js";
import { ServiceController } from "../desktop/service-controller.js";


const projectRoot = process.cwd();
const resourcesPath = path.join(projectRoot, "release", "win-unpacked", "resources");
const packagedRoot = path.join(resourcesPath, "app.asar.unpacked");
loadDesktopEnvironment({
  isPackaged: true,
  resourcesPath,
  projectRoot: packagedRoot,
  userDataPath: path.join(projectRoot, ".desktop-smoke-user-data"),
});
const controller = new ServiceController({
  spawn,
  ...resolveBackendLaunch({
    isPackaged: true,
    resourcesPath,
    projectRoot: packagedRoot,
    platform: process.platform,
  }),
  projectRoot: packagedRoot,
  startTimeoutMs: 20_000,
});

try {
  const state = await controller.start({ host: "127.0.0.1", port: 4199 });
  if (state.phase !== "running") throw new Error(state.error || "Packaged desktop service did not start.");
  const response = await fetch(`${state.url}/api/v1/health`);
  if (!response.ok) throw new Error(`Health endpoint returned HTTP ${response.status}.`);
  const sessionResponse = await fetch(`${state.url}/api/v1/auth/session`);
  const session = await sessionResponse.json();
  const authorizationResponse = await fetch(`${state.url}/api/v1/auth/google/start`, { redirect: "manual" });
  const authorizationLocation = authorizationResponse.headers.get("location");
  const authorizationHost = authorizationLocation ? new URL(authorizationLocation).host : null;
  console.log(JSON.stringify({
    state,
    health: await response.json(),
    providers: session.providers,
    googleAuthorization: { status: authorizationResponse.status, host: authorizationHost },
  }));
} finally {
  await controller.stop();
}
