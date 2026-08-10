const OAUTH_NAVIGATION_ORIGINS = new Set([
  "https://accounts.google.com",
]);


export function isAllowedNavigation(target, { appOrigin = null, allowProviderAuth = false } = {}) {
  try {
    const url = new URL(target);
    if (appOrigin && url.origin === appOrigin) return true;
    return allowProviderAuth && OAUTH_NAVIGATION_ORIGINS.has(url.origin);
  } catch {
    return false;
  }
}
