import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureEncryptionKey } from "../secret-store.js";

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("ensureEncryptionKey", () => {
  it("creates and then reuses a local 32-byte encryption key", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "revomail-key-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "server.key");
    const first = ensureEncryptionKey(filePath);
    const second = ensureEncryptionKey(filePath);
    expect(first).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(second).toBe(first);
  });
});
