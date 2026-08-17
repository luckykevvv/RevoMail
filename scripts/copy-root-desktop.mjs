import { copyFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";


export const MAX_GITHUB_FILE_BYTES = 100_000_000;


export function findPortableArtifact(releaseDirectory) {
  const candidates = readdirSync(releaseDirectory)
    .filter((name) => /^RevoMail-.*-win-.*\.exe$/i.test(name))
    .map((name) => ({ name, modified: statSync(path.join(releaseDirectory, name)).mtimeMs }))
    .sort((left, right) => right.modified - left.modified);
  if (!candidates.length) throw new Error("No Windows portable RevoMail artifact was found in release/.");
  return path.join(releaseDirectory, candidates[0].name);
}


export function copyPortableToRoot(projectRoot) {
  const source = findPortableArtifact(path.join(projectRoot, "release"));
  const sourceBytes = statSync(source).size;
  if (sourceBytes >= MAX_GITHUB_FILE_BYTES) {
    throw new Error(
      `The portable executable is ${sourceBytes} bytes; it must remain below GitHub's ${MAX_GITHUB_FILE_BYTES}-byte file limit.`
    );
  }
  const destination = path.join(projectRoot, "RevoMail.exe");
  copyFileSync(source, destination);
  console.log(`Copied ${path.basename(source)} to ${destination}`);
  return destination;
}


if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  try {
    copyPortableToRoot(projectRoot);
  } catch (error) {
    console.error(`Unable to publish the root desktop executable: ${error.message}`);
    process.exit(1);
  }
}
