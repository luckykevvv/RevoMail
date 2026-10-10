import path from "node:path";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { canAutoOpen, installAttachmentDownloads, isAppAttachmentDownload, uniqueDownloadPath } from "../attachment-downloads.js";

const origin = "http://localhost:4173";

describe("attachment downloads", () => {
  it("only auto-opens everyday file types", () => {
    for (const name of ["Report.PDF", "photo.jpg", "budget.xlsx", "notes.txt"]) expect(canAutoOpen(name)).toBe(true);
    for (const name of ["setup.exe", "run.bat", "macro.docm", "old.doc", "page.html", "script.js", "noextension"]) expect(canAutoOpen(name)).toBe(false);
  });

  it("recognises only RevoMail attachment URLs from the app origin", () => {
    expect(isAppAttachmentDownload(`${origin}/api/v1/emails/abc/attachments/0`, origin)).toBe(true);
    expect(isAppAttachmentDownload("https://evil.example/api/v1/emails/abc/attachments/0", origin)).toBe(false);
    expect(isAppAttachmentDownload(`${origin}/api/v1/emails/abc`, origin)).toBe(false);
    expect(isAppAttachmentDownload("data:text/plain,hi", origin)).toBe(false);
  });

  it("never overwrites an existing download and strips unsafe characters", () => {
    const dir = path.join("C:", "Downloads");
    const taken = new Set([path.join(dir, "report.pdf"), path.join(dir, "report (1).pdf")]);
    expect(uniqueDownloadPath(dir, "report.pdf", candidate => taken.has(candidate))).toBe(path.join(dir, "report (2).pdf"));
    expect(uniqueDownloadPath(dir, "../a:b?.txt", () => false)).toBe(path.join(dir, "a_b_.txt"));
  });

  function download(url, filename) {
    const item = new EventEmitter();
    Object.assign(item, { getURL: () => url, getFilename: () => filename, setSavePath: vi.fn() });
    return item;
  }

  it("saves app attachments to Downloads, opens safe types and only reveals risky ones", async () => {
    const session = new EventEmitter();
    const openPath = vi.fn().mockResolvedValue("");
    const showItemInFolder = vi.fn();
    installAttachmentDownloads({ session, origin: () => origin, downloadsPath: () => "/dl", openPath, showItemInFolder, exists: () => false });

    const pdf = download(`${origin}/api/v1/emails/m1/attachments/0`, "report.pdf");
    session.emit("will-download", {}, pdf);
    expect(pdf.setSavePath).toHaveBeenCalledWith(path.join("/dl", "report.pdf"));
    pdf.emit("done", {}, "completed"); await Promise.resolve();
    expect(openPath).toHaveBeenCalledWith(path.join("/dl", "report.pdf"));

    const exe = download(`${origin}/api/v1/emails/m1/attachments/1`, "setup.exe");
    session.emit("will-download", {}, exe);
    exe.emit("done", {}, "completed"); await Promise.resolve();
    expect(openPath).toHaveBeenCalledTimes(1);
    expect(showItemInFolder).toHaveBeenCalledWith(path.join("/dl", "setup.exe"));

    const other = download("https://elsewhere.example/file.pdf", "file.pdf");
    session.emit("will-download", {}, other);
    expect(other.setSavePath).not.toHaveBeenCalled();
  });
});
