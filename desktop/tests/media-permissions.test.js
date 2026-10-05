import { describe, expect, it } from "vitest";
import { isTrustedAudioRequest } from "../media-permissions.js";

describe("microphone permission boundary", () => {
  const contents = { isDestroyed: () => false, getURL: () => "http://localhost:4173/" };
  const request = { contents, expectedContents: contents, permission: "media", origin: "http://localhost:4173", details: { requestingUrl: "http://localhost:4173/", isMainFrame: true, mediaTypes: ["audio"] } };
  it("allows only trusted top-level audio", () => { expect(isTrustedAudioRequest(request)).toBe(true); });
  it.each([
    { isMainFrame: false }, { mediaTypes: ["video"] }, { mediaTypes: ["audio", "video"] },
    { requestingUrl: "https://accounts.google.com/" }, { requestingUrl: "about:blank" }, { mediaTypes: [] }
  ])("rejects other media contexts: %j", details => {
    expect(isTrustedAudioRequest({ ...request, details: { ...request.details, ...details } })).toBe(false);
  });
  it("rejects another window and non-media permissions", () => {
    expect(isTrustedAudioRequest({ ...request, contents: { ...contents } })).toBe(false);
    expect(isTrustedAudioRequest({ ...request, permission: "notifications" })).toBe(false);
  });
});
