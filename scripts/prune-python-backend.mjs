import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";


const REQUIRED_DISCOVERY_DOCUMENTS = new Set(["gmail.v1.json"]);


export function pruneGoogleDiscoveryDocuments(backendDirectory) {
  const documentsDirectory = path.join(
    backendDirectory,
    "_internal",
    "googleapiclient",
    "discovery_cache",
    "documents"
  );
  if (!existsSync(documentsDirectory)) {
    throw new Error(`Google discovery documents were not found at ${documentsDirectory}.`);
  }

  let removedFiles = 0;
  let removedBytes = 0;
  for (const name of readdirSync(documentsDirectory)) {
    if (REQUIRED_DISCOVERY_DOCUMENTS.has(name)) continue;
    const target = path.join(documentsDirectory, name);
    const metadata = statSync(target);
    if (!metadata.isFile()) continue;
    removedBytes += metadata.size;
    rmSync(target);
    removedFiles += 1;
  }

  const gmailDocument = path.join(documentsDirectory, "gmail.v1.json");
  if (!existsSync(gmailDocument)) throw new Error("The required Gmail v1 discovery document is missing.");
  return { removedFiles, removedBytes, keptFiles: [gmailDocument] };
}
