import { existsSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";


export function desktopEnvironmentCandidates({ isPackaged, resourcesPath, projectRoot, userDataPath }) {
  const candidates = [path.join(userDataPath, ".env")];
  if (isPackaged) {
    candidates.push(path.resolve(resourcesPath, "..", "..", "..", ".env"));
  } else {
    candidates.push(path.join(projectRoot, ".env"));
  }
  return [...new Set(candidates)];
}


export function loadDesktopEnvironment(options, { exists = existsSync, load = loadDotenv } = {}) {
  const loaded = [];
  for (const envPath of desktopEnvironmentCandidates(options)) {
    if (!exists(envPath)) continue;
    load({ path: envPath, override: false });
    loaded.push(envPath);
  }
  return loaded;
}
