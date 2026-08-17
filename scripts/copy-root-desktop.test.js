import {
  closeSync,
  ftruncateSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { copyPortableToRoot, findPortableArtifact, MAX_GITHUB_FILE_BYTES } from "./copy-root-desktop.mjs";


const temporaryDirectories = [];


afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});


describe("root portable desktop publishing", () => {
  it("selects the newest Windows portable artifact", () => {
    const releaseDirectory = mkdtempSync(path.join(os.tmpdir(), "revomail-release-"));
    temporaryDirectories.push(releaseDirectory);
    const older = path.join(releaseDirectory, "RevoMail-0.1.0-win-x64.exe");
    const newer = path.join(releaseDirectory, "RevoMail-0.2.0-win-x64.exe");
    writeFileSync(older, "old", "utf8");
    writeFileSync(newer, "new", "utf8");
    mkdirSync(path.join(releaseDirectory, "win-unpacked"));
    utimesSync(older, new Date(1_000), new Date(1_000));
    utimesSync(newer, new Date(2_000), new Date(2_000));

    expect(findPortableArtifact(releaseDirectory)).toBe(newer);
  });

  it("rejects an artifact at GitHub's ordinary file-size limit", () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), "revomail-project-"));
    temporaryDirectories.push(projectRoot);
    const releaseDirectory = path.join(projectRoot, "release");
    mkdirSync(releaseDirectory);
    const artifact = path.join(releaseDirectory, "RevoMail-0.1.0-win-x64.exe");
    writeFileSync(artifact, "placeholder", "utf8");
    truncateForTest(artifact, MAX_GITHUB_FILE_BYTES);

    expect(() => copyPortableToRoot(projectRoot)).toThrow("must remain below GitHub's");
  });
});


function truncateForTest(file, size) {
  const descriptor = openSync(file, "r+");
  try {
    ftruncateSync(descriptor, size);
  } finally {
    closeSync(descriptor);
  }
}
