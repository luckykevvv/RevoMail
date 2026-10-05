// Keep media permissions scoped to the trusted top-level mail window, never email frames.
export function isTrustedAudioRequest({ contents, expectedContents, permission, details, origin }) {
  if (!contents || contents !== expectedContents || contents.isDestroyed() || permission !== "media") return false;
  try {
    const expectedOrigin = new URL(origin).origin;
    if (new URL(contents.getURL()).origin !== expectedOrigin) return false;
    if (new URL(details.requestingUrl || details.securityOrigin || details.requestingOrigin).origin !== expectedOrigin) return false;
    if (details.isMainFrame !== true) return false;
    const media = details.mediaTypes || [details.mediaType];
    return media.length === 1 && media[0] === "audio";
  } catch { return false; }
}

export function installAudioPermissions({ window, origin, confirm }) {
  let granted = false;
  let pending = false;
  const contents = window.webContents;
  const session = contents.session;
  session.setPermissionCheckHandler((candidate, permission, requestingOrigin, details) =>
    granted && isTrustedAudioRequest({ contents: candidate, expectedContents: contents, permission, origin: origin(), details: { ...details, requestingOrigin } }));
  session.setPermissionRequestHandler(async (candidate, permission, callback, details) => {
    const request = { contents: candidate, expectedContents: contents, permission, origin: origin(), details };
    if (!isTrustedAudioRequest(request) || pending) { callback(false); return; }
    if (granted) { callback(true); return; }
    pending = true;
    try {
      const allowed = await confirm();
      granted = Boolean(allowed) && isTrustedAudioRequest({ ...request, origin: origin() });
      callback(granted);
    } catch { callback(false); }
    finally { pending = false; }
  });
  contents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => { if (isMainFrame && !isInPlace) granted = false; });
  window.on("closed", () => { granted = false; });
}
