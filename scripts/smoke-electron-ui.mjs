import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";


const projectRoot = process.cwd();
const googleTestEmail = process.argv[2] || null;
const executable = path.join(projectRoot, "release", "win-unpacked", "RevoMail.exe");
const debuggingPort = 9333;
const applicationOrigin = "http://localhost:4173";
const smokeUserData = path.join(projectRoot, "build", "electron-ui-smoke", String(Date.now()));
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;

const child = spawn(executable, [`--remote-debugging-port=${debuggingPort}`, `--user-data-dir=${smokeUserData}`], {
  cwd: projectRoot,
  env: environment,
  stdio: "ignore",
  windowsHide: false,
});

async function targets() {
  const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`);
  if (!response.ok) throw new Error(`DevTools target listing returned HTTP ${response.status}.`);
  return response.json();
}

async function waitForTarget(predicate, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const target = (await targets()).find(predicate);
      if (target) return target;
    } catch {
      // Electron may still be opening its debugging endpoint.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("The expected Electron renderer did not appear.");
}

async function evaluate(target, expression) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("Electron renderer evaluation timed out."));
    }, 10_000);
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: { expression, awaitPromise: true, returnByValue: true },
      }));
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== 1) return;
      clearTimeout(timer);
      socket.close();
      if (message.result?.exceptionDetails) reject(new Error(message.result.exceptionDetails.text));
      else resolve(message.result?.result?.value);
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("Could not connect to the Electron renderer."));
    });
  });
}

try {
  const launcher = await waitForTarget((target) => target.title === "RevoMail Desktop");
  await evaluate(launcher, "document.querySelector('#start-button').click(); true");

  const deadline = Date.now() + 20_000;
  let health;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${applicationOrigin}/api/v1/health`);
      if (response.ok) {
        health = await response.json();
        break;
      }
    } catch {
      // The packaged backend may still be extracting and starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!health) throw new Error("The real Electron launcher did not start a healthy service.");

  let launcherState;
  const launcherDeadline = Date.now() + 5_000;
  while (Date.now() < launcherDeadline) {
    launcherState = await evaluate(launcher, `(() => ({
      phase: document.querySelector('#status-badge')?.dataset.phase,
      openDisabled: document.querySelector('#open-button')?.disabled,
      error: document.querySelector('#service-error')?.textContent || null
    }))()`);
    if (launcherState?.phase === "running") break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await evaluate(launcher, "document.querySelector('#open-button').click(); true");
  const application = await waitForTarget((target) => target.url === `${applicationOrigin}/`);
  const session = await fetch(`${applicationOrigin}/api/v1/auth/session`).then((response) => response.json());
  let applicationState;
  const applicationDeadline = Date.now() + 10_000;
  while (Date.now() < applicationDeadline) {
    applicationState = await evaluate(application, `(() => ({
      googleButtonExists: Boolean(document.querySelector('[data-login="google"]')),
      googleButtonDisabled: document.querySelector('[data-login="google"]')?.disabled,
      authenticatedShellVisible: Boolean(document.querySelector('[data-nav]')),
      providerNoteVisible: Boolean(document.querySelector('.provider-note'))
    }))()`);
    if (applicationState?.googleButtonExists) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!applicationState?.googleButtonExists) throw new Error("The signed-out Google login button did not appear.");
  await evaluate(application, "document.querySelector('[data-login=\"google\"]')?.click(); true");
  const googleAuthorizationTarget = await waitForTarget((target) => {
    try {
      return new URL(target.url).host === "accounts.google.com";
    } catch {
      return false;
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  const settledGoogleTarget = (await targets()).find((target) => {
    try {
      return new URL(target.url).host === "accounts.google.com";
    } catch {
      return false;
    }
  }) || googleAuthorizationTarget;
  const settledGoogleUrl = new URL(settledGoogleTarget.url);
  let googleIdentifierSubmission = null;
  if (googleTestEmail) {
    await evaluate(settledGoogleTarget, `(() => {
      const input = document.querySelector('input[type="email"]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(googleTestEmail)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#identifierNext button, #identifierNext')?.click();
      return true;
    })()`);
    const identifierDeadline = Date.now() + 10_000;
    while (Date.now() < identifierDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const googleTarget = (await targets()).find((target) => {
        try { return new URL(target.url).host === "accounts.google.com"; } catch { return false; }
      });
      if (!googleTarget) continue;
      const state = await evaluate(googleTarget, `(() => ({
        passwordStage: Boolean(document.querySelector('input[type="password"]')),
        identifierStage: Boolean(document.querySelector('input[type="email"]')),
        invalidIdentifier: document.querySelector('input[type="email"]')?.getAttribute('aria-invalid') === 'true'
      }))()`);
      googleIdentifierSubmission = state;
      if (state?.passwordStage || state?.invalidIdentifier) break;
    }
  }
  console.log(JSON.stringify({
    health,
    providers: session.providers,
    launcher: launcherState,
    application: applicationState,
    googleAuthorization: {
      host: settledGoogleUrl.host,
      path: settledGoogleUrl.pathname,
      title: settledGoogleTarget.title,
    },
    googleIdentifierSubmission,
  }));
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 500));
  fs.rmSync(smokeUserData, { recursive: true, force: true });
}
