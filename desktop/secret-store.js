import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const KEY_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

export function ensureEncryptionKey(filePath) {
  try {
    const existing = fs.readFileSync(filePath, "utf8").trim();
    if (KEY_PATTERN.test(existing)) return existing;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const key = crypto.randomBytes(32).toString("base64");
  fs.writeFileSync(filePath, `${key}\n`, { encoding: "utf8", mode: 0o600 });
  return key;
}
