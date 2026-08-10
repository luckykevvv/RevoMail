import path from "node:path";
import { resolvePythonCommand } from "../scripts/python-runtime.mjs";


export function resolveBackendLaunch({ isPackaged, resourcesPath, projectRoot, platform = process.platform }) {
  if (isPackaged) {
    return {
      command: path.join(resourcesPath, "python-backend", platform === "win32" ? "revomail-backend.exe" : "revomail-backend"),
      commandArgs: [],
    };
  }
  return {
    command: resolvePythonCommand(projectRoot),
    commandArgs: ["-m", "backend.run"],
  };
}
