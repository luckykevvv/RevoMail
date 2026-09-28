import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { ServiceController } from "../service-controller.js";

function childProcess() {
  const child = new EventEmitter();
  child.pid = 1234;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = vi.fn(() => {
    child.killed = true;
    queueMicrotask(() => child.emit("exit", 0, "SIGTERM"));
    return true;
  });
  return child;
}

function settings() {
  return { host: "127.0.0.1", port: 4173 };
}

function healthyResponse() {
  return { ok: true, json: vi.fn(async () => ({ status: "ok", service: "revomail-api" })) };
}

function healthyAfterSpawn() {
  return vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue(healthyResponse());
}

describe("ServiceController", () => {
  it("moves to running only after a successful health check", async () => {
    const child = childProcess();
    const spawn = vi.fn(() => child);
    const controller = new ServiceController({ spawn, command: "python", commandArgs: ["-m", "backend.run"], projectRoot: "C:\\RevoMail", fetchImpl: healthyAfterSpawn() });
    await controller.start(settings());
    expect(controller.snapshot()).toMatchObject({ phase: "running", pid: 1234, url: "http://127.0.0.1:4173", error: null });
    expect(spawn).toHaveBeenCalledOnce();
    expect(spawn.mock.calls[0][0]).toBe("python");
    expect(spawn.mock.calls[0][1]).toEqual(["-m", "backend.run"]);
  });

  it("reuses an existing healthy RevoMail service without spawning a duplicate", async () => {
    const spawn = vi.fn();
    const controller = new ServiceController({ spawn, command: "python", projectRoot: "C:\\RevoMail", fetchImpl: vi.fn(async () => healthyResponse()) });

    await controller.start(settings());

    expect(spawn).not.toHaveBeenCalled();
    expect(controller.snapshot()).toMatchObject({ phase: "running", pid: null, managed: false, url: "http://127.0.0.1:4173", error: null });
  });

  it("does not adopt an unrelated healthy HTTP service", async () => {
    const child = childProcess();
    const spawn = vi.fn(() => child);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ok", service: "another-app" }) })
      .mockResolvedValue(healthyResponse());
    const controller = new ServiceController({ spawn, command: "python", projectRoot: "C:\\RevoMail", fetchImpl });

    await controller.start(settings());

    expect(spawn).toHaveBeenCalledOnce();
    expect(controller.snapshot()).toMatchObject({ phase: "running", pid: 1234, managed: true });
  });

  it("does not create duplicate processes while active", async () => {
    const child = childProcess();
    const spawn = vi.fn(() => child);
    const controller = new ServiceController({ spawn, command: "python", commandArgs: ["-m", "backend.run"], projectRoot: "C:\\RevoMail", fetchImpl: healthyAfterSpawn() });
    await controller.start(settings());
    await controller.start(settings());
    expect(spawn).toHaveBeenCalledOnce();
  });

  it("stops the managed child and clears process state", async () => {
    const child = childProcess();
    const controller = new ServiceController({ spawn: () => child, command: "python", commandArgs: ["-m", "backend.run"], projectRoot: "C:\\RevoMail", fetchImpl: healthyAfterSpawn() });
    await controller.start(settings());
    await controller.stop();
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(controller.snapshot()).toMatchObject({ phase: "stopped", pid: null, error: null });
  });

  it("reports an unexpected child exit", async () => {
    const child = childProcess();
    const controller = new ServiceController({ spawn: () => child, command: "python", commandArgs: ["-m", "backend.run"], projectRoot: "C:\\RevoMail", fetchImpl: healthyAfterSpawn() });
    await controller.start(settings());
    child.stderr.emit("data", Buffer.from("ModuleNotFoundError: No module named 'itsdangerous'\n"));
    child.emit("exit", 1, null);
    expect(controller.snapshot()).toMatchObject({ phase: "failed", pid: null, error: expect.stringContaining("itsdangerous") });
  });
});
