import { EventEmitter } from "node:events";
import path from "node:path";

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

export class ServiceController extends EventEmitter {
  constructor({ spawn, command, projectRoot, fetchImpl = globalThis.fetch, startTimeoutMs = DEFAULT_START_TIMEOUT_MS, stopTimeoutMs = DEFAULT_STOP_TIMEOUT_MS }) {
    super();
    this.spawn = spawn;
    this.command = command;
    this.projectRoot = projectRoot;
    this.fetch = fetchImpl;
    this.startTimeoutMs = startTimeoutMs;
    this.stopTimeoutMs = stopTimeoutMs;
    this.child = null;
    this.intentionalStop = false;
    this.state = { phase: "stopped", pid: null, url: null, startedAt: null, error: null };
  }

  snapshot() {
    return { ...this.state };
  }

  async start(settings) {
    if (ACTIVE_PHASES.has(this.state.phase)) return this.snapshot();
    const url = `http://${publicHost(settings.host)}:${settings.port}`;
    this.intentionalStop = false;
    this.#setState({ phase: "starting", pid: null, url, startedAt: null, error: null });

    const child = this.spawn(this.command, [path.join(this.projectRoot, "server.js")], {
      cwd: this.projectRoot,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        REVOMAIL_DESKTOP: "1",
        HOST: settings.host,
        PORT: String(settings.port),
        APP_BASE_URL: url
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    this.child = child;
    this.#setState({ pid: child.pid ?? null });

    child.once("error", (error) => {
      if (this.child !== child) return;
      this.child = null;
      this.#setState({ phase: "failed", pid: null, startedAt: null, error: safeMessage(error) });
    });
    child.once("exit", (code, signal) => {
      if (this.child !== child) return;
      this.child = null;
      const stoppedNormally = this.intentionalStop || this.state.phase === "stopping";
      this.#setState({
        phase: stoppedNormally ? "stopped" : "failed",
        pid: null,
        startedAt: null,
        error: stoppedNormally ? null : `The service exited before it became healthy (${signal || `code ${code ?? "unknown"}`}). Check local file access and any configured OAuth values, then try again.`
      });
    });

    try {
      await this.#waitForHealth(url, child);
      if (this.child !== child) return this.snapshot();
      this.#setState({ phase: "running", startedAt: new Date().toISOString(), error: null });
    } catch (error) {
      if (this.child !== child && this.state.phase === "failed") return this.snapshot();
      if (this.child === child) {
        this.intentionalStop = true;
        child.kill("SIGTERM");
        this.child = null;
      }
      this.#setState({ phase: "failed", pid: null, startedAt: null, error: safeMessage(error) });
    }
    return this.snapshot();
  }

  async stop() {
    const child = this.child;
    if (!child) {
      this.#setState({ phase: "stopped", pid: null, startedAt: null, error: null });
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
    this.#setState({ phase: "stopped", pid: null, startedAt: null, error: null });
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
      try {
        const response = await this.fetch(`${url}/api/v1/health`, { signal: AbortSignal.timeout(1_500) });
        if (response.ok) return;
      } catch {
        // The service may still be applying local migrations or opening its database.
      }
      await new Promise((resolve) => setTimeout(resolve, HEALTH_INTERVAL_MS));
    }
    throw new Error("RevoMail did not become healthy within 15 seconds. Check local file access and application configuration.");
  }

  #setState(patch) {
    this.state = { ...this.state, ...patch };
    this.emit("state", this.snapshot());
  }
}
