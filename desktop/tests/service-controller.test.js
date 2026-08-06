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

describe("ServiceController", () => {
  it("moves to running only after a successful health check", async () => {
    const child = childProcess();
    const spawn = vi.fn(() => child);
    const controller = new ServiceController({ spawn, command: "electron", projectRoot: "C:\\RevoMail", fetchImpl: vi.fn(async () => ({ ok: true })) });
    await controller.start(settings());
    expect(controller.snapshot()).toMatchObject({ phase: "running", pid: 1234, url: "http://127.0.0.1:4173", error: null });
    expect(spawn).toHaveBeenCalledOnce();
  });

  it("does not create duplicate processes while active", async () => {
    const child = childProcess();
    const spawn = vi.fn(() => child);
    const controller = new ServiceController({ spawn, command: "electron", projectRoot: "C:\\RevoMail", fetchImpl: vi.fn(async () => ({ ok: true })) });
    await controller.start(settings());
    await controller.start(settings());
    expect(spawn).toHaveBeenCalledOnce();
  });

  it("stops the managed child and clears process state", async () => {
    const child = childProcess();
    const controller = new ServiceController({ spawn: () => child, command: "electron", projectRoot: "C:\\RevoMail", fetchImpl: vi.fn(async () => ({ ok: true })) });
    await controller.start(settings());
    await controller.stop();
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(controller.snapshot()).toMatchObject({ phase: "stopped", pid: null, error: null });
  });

  it("reports an unexpected child exit", async () => {
    const child = childProcess();
    const controller = new ServiceController({ spawn: () => child, command: "electron", projectRoot: "C:\\RevoMail", fetchImpl: vi.fn(async () => ({ ok: true })) });
    await controller.start(settings());
    child.emit("exit", 1, null);
    expect(controller.snapshot()).toMatchObject({ phase: "failed", pid: null, error: expect.stringContaining("local file access") });
  });
});
