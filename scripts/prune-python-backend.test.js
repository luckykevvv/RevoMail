import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { pruneGoogleDiscoveryDocuments } from "./prune-python-backend.mjs";


const temporaryDirectories = [];


afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});


describe("standalone backend pruning", () => {
  it("keeps Gmail and OAuth profile discovery data and removes unrelated APIs", () => {
    const backendDirectory = mkdtempSync(path.join(os.tmpdir(), "revomail-backend-"));
    temporaryDirectories.push(backendDirectory);
    const documentsDirectory = path.join(
      backendDirectory,
      "_internal",
      "googleapiclient",
      "discovery_cache",
      "documents"
    );
    mkdirSync(documentsDirectory, { recursive: true });
    writeFileSync(path.join(documentsDirectory, "gmail.v1.json"), "gmail", "utf8");
    writeFileSync(path.join(documentsDirectory, "oauth2.v2.json"), "oauth2", "utf8");
    writeFileSync(path.join(documentsDirectory, "drive.v3.json"), "drive", "utf8");

    const result = pruneGoogleDiscoveryDocuments(backendDirectory);

    expect(result.removedFiles).toBe(1);
    expect(result.removedBytes).toBe(5);
    expect(readdirSync(documentsDirectory)).toEqual(["gmail.v1.json", "oauth2.v2.json"]);
  });
});
