import { AppError } from "../../utils/errors.js";

const GOOGLE_SCOPES = [
  "openid", "email", "profile",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events"
];

const MICROSOFT_SCOPES = [
  "openid", "profile", "email", "offline_access",
  "User.Read", "Mail.ReadWrite", "Mail.Send", "Calendars.ReadWrite"
];

async function readJson(response, code) {
  let payload;
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) throw new AppError(code, "The authorization provider could not complete the request.", 502, response.status >= 500 || response.status === 429);
  return payload;
}

export function createOAuthProvider({ name, clientId, clientSecret, authorizationUrl, tokenUrl, userInfoUrl, revokeUrl, redirectUri, fetchImpl = fetch }) {
  const scopes = name === "google" ? GOOGLE_SCOPES : MICROSOFT_SCOPES;
  const configured = Boolean(clientId && clientSecret);
  const requireConfigured = () => {
    if (!configured) throw new AppError("PROVIDER_NOT_CONFIGURED", `${name === "google" ? "Google" : "Microsoft"} sign-in is not configured.`, 503, false);
  };

  return {
    name,
    scopes,
    configured,
    authorizationUrl({ state, challenge, prompt = "select_account" }) {
      requireConfigured();
      const url = new URL(authorizationUrl);
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: scopes.join(" "),
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        prompt
      }).toString();
      if (name === "google") url.searchParams.set("access_type", "offline");
      return url.toString();
    },
    async exchangeCode({ code, verifier }) {
      requireConfigured();
      const response = await fetchImpl(tokenUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, code_verifier: verifier, redirect_uri: redirectUri, grant_type: "authorization_code" }),
        signal: AbortSignal.timeout(10_000)
      });
      const token = await readJson(response, "TOKEN_EXCHANGE_FAILED");
      if (!token.access_token) throw new AppError("TOKEN_EXCHANGE_FAILED", "The provider returned an invalid authorization response.", 502, false);
      return token;
    },
    async profile(accessToken) {
      const response = await fetchImpl(userInfoUrl, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
      const profile = await readJson(response, "PROFILE_FETCH_FAILED");
      const id = name === "google" ? profile.sub : profile.id;
      const email = name === "google" ? profile.email : (profile.mail || profile.userPrincipalName);
      if (name === "google" && profile.email_verified !== true) throw new AppError("PROFILE_FETCH_FAILED", "Google did not return a verified email address.", 502, false);
      if (!id || !email) throw new AppError("PROFILE_FETCH_FAILED", "The provider did not return an account identifier and email address.", 502, false);
      return { id, email: email.toLowerCase(), displayName: profile.name || profile.displayName || email, avatarUrl: profile.picture || null };
    },
    async refresh(refreshToken) {
      requireConfigured();
      const response = await fetchImpl(tokenUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token", scope: scopes.join(" ") }),
        signal: AbortSignal.timeout(10_000)
      });
      return readJson(response, "TOKEN_REFRESH_FAILED");
    },
    async revoke(accessToken) {
      if (!revokeUrl) return { supported: false };
      const response = await fetchImpl(revokeUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: accessToken }),
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) throw new AppError("PROVIDER_REVOCATION_FAILED", "Provider access could not be revoked. Try again.", 502, true);
      return { supported: true };
    }
  };
}

export function createProviders(config, fetchImpl = fetch) {
  return {
    google: createOAuthProvider({ name: "google", clientId: config.GOOGLE_CLIENT_ID, clientSecret: config.GOOGLE_CLIENT_SECRET, authorizationUrl: config.GOOGLE_AUTH_URL, tokenUrl: config.GOOGLE_TOKEN_URL, userInfoUrl: config.GOOGLE_USERINFO_URL, revokeUrl: config.GOOGLE_REVOKE_URL, redirectUri: `${config.APP_BASE_URL}/api/v1/auth/google/callback`, fetchImpl }),
    microsoft: createOAuthProvider({ name: "microsoft", clientId: config.MICROSOFT_CLIENT_ID, clientSecret: config.MICROSOFT_CLIENT_SECRET, authorizationUrl: config.MICROSOFT_AUTH_URL, tokenUrl: config.MICROSOFT_TOKEN_URL, userInfoUrl: config.MICROSOFT_USERINFO_URL, revokeUrl: null, redirectUri: `${config.APP_BASE_URL}/api/v1/auth/microsoft/callback`, fetchImpl })
  };
}
