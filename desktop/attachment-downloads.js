import fs from "node:fs";
import path from "node:path";

// Everyday document, image and media types that are opened in their default app after download.
// Anything else (programs, scripts, macro-enabled or legacy Office files, web pages…) is only saved
// and shown in its folder, so an attachment can never launch code just by being clicked.
export const AUTO_OPEN_EXTENSIONS = new Set([
  "pdf", "txt", "csv", "docx", "xlsx", "pptx", "odt", "ods", "odp",
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "heic",
  "mp3", "wav", "m4a", "mp4", "mov", "zip", "ics", "vcf", "eml"
]);

export function canAutoOpen(filename) {
  return AUTO_OPEN_EXTENSIONS.has(path.extname(String(filename || "")).slice(1).toLowerCase());
}

export function isAppAttachmentDownload(url, origin) {
  try {
    const target = new URL(url);
    return Boolean(origin) && target.origin === new URL(origin).origin
      && /^\/api\/v1\/emails\/[^/]+\/attachments\/\d+$/.test(target.pathname);
  } catch {
    return false;
  }
}

export function uniqueDownloadPath(directory, filename, exists = fs.existsSync) {
  const cleaned = path.basename(String(filename || "")).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "");
  const safe = cleaned || "attachment";
  const extension = path.extname(safe);
  const stem = safe.slice(0, safe.length - extension.length) || "attachment";
  let candidate = path.join(directory, safe);
  for (let number = 1; exists(candidate); number++) candidate = path.join(directory, `${stem} (${number})${extension}`);
  return candidate;
}

const installed = new WeakSet();

export function installAttachmentDownloads({ session, origin, downloadsPath, openPath, showItemInFolder, exists }) {
  if (installed.has(session)) return;
  installed.add(session);
  session.on("will-download", (_event, item) => {
    // Only RevoMail's own attachment downloads are saved and opened automatically.
    // Any other download keeps Electron's normal Save As prompt and is never opened.
    if (!isAppAttachmentDownload(item.getURL(), origin())) return;
    const target = uniqueDownloadPath(downloadsPath(), item.getFilename(), exists);
    item.setSavePath(target);
    item.once("done", async (_doneEvent, state) => {
      if (state !== "completed") return;
      if (!canAutoOpen(target)) { showItemInFolder(target); return; }
      const error = await openPath(target);
      if (error) showItemInFolder(target);
    });
  });
}
