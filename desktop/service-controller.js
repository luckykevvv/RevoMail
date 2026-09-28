import { EventEmitter } from "node:events";

const ACTIVE_PHASES = new Set(["starting", "running", "stopping"]);
const HEALTH_INTERVAL_MS = 350;
const DEFAULT_START_TIMEOUT_MS = 15_000;
const DEFAULT_STOP_TIMEOUT_MS = 5_000;

function publicHost(host) {
  return host === "0.0.0.0" ? "127.0.0.1" : host;
}

function safeMessage(error) {
  if (error?.name === "AbortError") return "The health check timed out.";
  return error?.message || "The service could not be started.";
}

function safeBackendDetail(output) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const detail = lines.at(-1);
  if (!detail) return null;
  return detail.replace(/https?:\/\/\S+/gi, "[url]").slice(0, 300);
}

export class ServiceController extends EventEmitter {
  constructor({ spawn, command, commandArgs = [], projectRoot, fetchImpl = globalThis.fetch, startTimeoutMs = DEFAULT_START_TIMEOUT_MS, stopTimeoutMs = DEFAULT_STOP_TIMEOUT_MS }) {
    super();
    this.spawn = spawn;
    this.command = command;
    this.commandArgs = commandArgs;
    this.projectRoot = projectRoot;
    this.fetch = fetchImpl;
    this.startTimeoutMs = startTimeoutMs;
    this.stopTimeoutMs = stopTimeoutMs;
    this.child = null;
    this.intentionalStop = false;
    this.backendOutput = "";
    this.state = { phase: "stopped", pid: null, url: null, startedAt: null, error: null, managed: false };
  }

  snapshot() {
    return { ...this.state };
  }

  async start(settings) {
    if (ACTIVE_PHASES.has(this.state.phase)) return this.snapshot();
    const url = `http://${publicHost(settings.host)}:${settings.port}`;
    this.intentionalStop = false;
    this.backendOutput = "";
    this.#setState({ phase: "starting", pid: null, url, startedAt: null, error: null, managed: false });

    // Development workflows may already have RevoMail running through `npm run start`.
    // Adopt only a verified RevoMail health endpoint instead of spawning a second
    // process that immediately loses the port race and is reported as a failure.
    if (await this.#isHealthyRevoMail(url)) {
      this.#setState({ phase: "running", pid: null, startedAt: null, error: null, managed: false });
      return this.snapshot();
    }

    const child = this.spawn(this.command, this.commandArgs, {
      cwd: this.projectRoot,
      env: {
        ...process.env,
        REVOMAIL_DESKTOP: "1",
        REVOMAIL_PROJECT_ROOT: this.projectRoot,
        HOST: settings.host,
        PORT: String(settings.port),
        APP_BASE_URL: url
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    this.child = child;
    this.#setState({ pid: child.pid ?? null, managed: true });

    const captureOutput = (chunk) => {
      this.backendOutput = `${this.backendOutput}${String(chunk)}`.slice(-4_000);
    };
    child.stdout?.on("data", captureOutput);
    child.stderr?.on("data", captureOutput);

    child.once("error", (error) => {
      if (this.child !== child) return;
      this.child = null;
      this.#setState({ phase: "failed", pid: null, startedAt: null, error: safeMessage(error), managed: false });
    });
    child.once("exit", (code, signal) => {
      if (this.child !== child) return;
      this.child = null;
      const stoppedNormally = this.intentionalStop || this.state.phase === "stopping";
      const detail = safeBackendDetail(this.backendOutput);
      this.#setState({
        phase: stoppedNormally ? "stopped" : "failed",
        pid: null,
        startedAt: null,
        error: stoppedNormally ? null : `The service exited before it became healthy (${signal || `code ${code ?? "unknown"}`}).${detail ? ` Backend error: ${detail}` : " Check local file access, then try again."}`,
        managed: false
      });
    });

    try {
      await this.#waitForHealth(url, child);
      if (this.child !== child) return this.snapshot();
      this.#setState({ phase: "running", startedAt: new Date().toISOString(), error: null, managed: true });
    } catch (error) {
      if (this.child !== child && this.state.phase === "failed") return this.snapshot();
      if (this.child === child) {
        this.intentionalStop = true;
        child.kill("SIGTERM");
        this.child = null;
      }
      this.#setState({ phase: "failed", pid: null, startedAt: null, error: safeMessage(error), managed: false });
    }
    return this.snapshot();
  }

  async stop() {
    const child = this.child;
    if (!child) {
      this.#setState({ phase: "stopped", pid: null, startedAt: null, error: null, managed: false });
      return this.snapshot();
    }
    this.intentionalStop = true;
    this.#setState({ phase: "stopping", error: null });
    await new Promise((resolve) => {
      let completed = false;
      const finish = () => {
        if (completed) return;
        completed = true;
        clearTimeout(forceTimer);
        resolve();
      };
      child.once("exit", finish);
      const forceTimer = setTimeout(() => {
        child.kill("SIGKILL");
        finish();
      }, this.stopTimeoutMs);
      child.kill("SIGTERM");
    });
    if (this.child === child) this.child = null;
    this.#setState({ phase: "stopped", pid: null, startedAt: null, error: null, managed: false });
    return this.snapshot();
  }

  async restart(settings) {
    await this.stop();
    return this.start(settings);
  }

  async #waitForHealth(url, child) {
    const deadline = Date.now() + this.startTimeoutMs;
    while (Date.now() < deadline) {
      if (this.child !== child) throw new Error("The service exited before it became healthy.");
      if (await this.#isHealthyRevoMail(url)) return;
      await new Promise((resolve) => setTimeout(resolve, HEALTH_INTERVAL_MS));
    }
    throw new Error("RevoMail did not become healthy within 15 seconds. Check local file access and application configuration.");
  }

  async #isHealthyRevoMail(url) {
    try {
      const response = await this.fetch(`${url}/api/v1/health`, { signal: AbortSignal.timeout(1_500) });
      if (!response.ok) return false;
      const body = await response.json();
      return body?.status === "ok" && body?.service === "revomail-api";
    } catch {
      return false;
    }
  }

  #setState(patch) {
    this.state = { ...this.state, ...patch };
    this.emit("state", this.snapshot());
  }
}
