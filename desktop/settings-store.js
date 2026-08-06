import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

export const desktopSettingsSchema = z.object({
  host: z.enum(["127.0.0.1", "localhost"]),
  port: z.coerce.number().int().min(1024).max(65535),
  autoStart: z.boolean(),
  launchOnReady: z.boolean(),
  stopOnExit: z.boolean(),
  theme: z.enum(["system", "light", "dark"]),
  language: z.enum(["en", "zh-CN", "es"]),
  reducedMotion: z.boolean()
}).strict();

export const DEFAULT_DESKTOP_SETTINGS = Object.freeze({
  host: "127.0.0.1",
  port: 4173,
  autoStart: false,
  launchOnReady: true,
  stopOnExit: true,
  theme: "system",
  language: "en",
  reducedMotion: false
});

export class DesktopSettingsStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.settings = this.#load();
  }

  get() {
    return structuredClone(this.settings);
  }

  update(candidate) {
    const parsed = desktopSettingsSchema.parse({ ...this.settings, ...candidate });
    this.settings = parsed;
    this.#persist();
    return this.get();
  }

  reset() {
    this.settings = { ...DEFAULT_DESKTOP_SETTINGS };
    this.#persist();
    return this.get();
  }

  #load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      const result = desktopSettingsSchema.safeParse({ ...DEFAULT_DESKTOP_SETTINGS, ...parsed });
      return result.success ? result.data : { ...DEFAULT_DESKTOP_SETTINGS };
    } catch (error) {
      if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
      return { ...DEFAULT_DESKTOP_SETTINGS };
    }
  }

  #persist() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(this.settings, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporaryPath, this.filePath);
  }
}
