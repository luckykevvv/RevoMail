import crypto from "node:crypto";
import path from "node:path";
import express from "express";
import helmet from "helmet";
import { AppError, errorResponse } from "./utils/errors.js";

export const SESSION_COOKIE = "rv_session";

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((part) => part.trim().split("=")).filter(([key, value]) => key && value).map(([key, value]) => [key, decodeURIComponent(value)]));
}

export function createApp({ authService, config, distPath, healthCheck = async () => true, logger = console }) {
  const app = express();
  app.disable("x-powered-by");
  if (config.NODE_ENV === "production") app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-origin" } }));
  app.use(express.json({ limit: "32kb" }));
  app.use((request, response, next) => {
    request.correlationId = request.get("x-correlation-id") || crypto.randomUUID();
    response.set("x-correlation-id", request.correlationId);
    request.cookies = parseCookies(request.get("cookie"));
    next();
  });

  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: config.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000
  };

  async function optionalSession(request, _response, next) {
    try {
      request.session = await authService.authenticate(request.cookies[SESSION_COOKIE]);
      next();
    } catch (error) { next(error); }
  }

  function requireSession(request, _response, next) {
    if (!request.session) return next(new AppError("AUTHENTICATION_REQUIRED", "Sign in to continue.", 401, false));
    next();
  }

  function requireCsrf(request, _response, next) {
    try {
      authService.assertCsrf(request.session, request.get("x-csrf-token"));
      next();
    } catch (error) { next(error); }
  }

  app.get("/api/v1/health", async (_request, response, next) => {
    try {
      await healthCheck();
      response.json({ status: "ok" });
    } catch (error) { next(new AppError("DATABASE_UNAVAILABLE", "The service is temporarily unavailable.", 503, true)); }
  });

  app.get("/api/v1/auth/session", optionalSession, async (request, response, next) => {
    try {
      if (!request.session) return response.json({ authenticated: false, providers: authService.providerStatus() });
      const csrfToken = await authService.issueCsrf(request.session);
      response.json({
        authenticated: true,
        user: { id: request.session.user.id, email: request.session.user.email, displayName: request.session.user.displayName, avatarUrl: request.session.user.avatarUrl },
        csrfToken,
        providers: authService.providerStatus()
      });
    } catch (error) { next(error); }
  });

  app.get("/api/v1/auth/:provider/start", async (request, response, next) => {
    try {
      const url = await authService.beginAuthorization(request.params.provider, request.query.returnTo);
      response.redirect(302, url);
    } catch (error) { next(error); }
  });

  app.get("/api/v1/auth/:provider/callback", async (request, response) => {
    try {
      if (request.query.error) throw new AppError("AUTHORIZATION_DENIED", "Authorization was cancelled or denied.", 400, true);
      const result = await authService.completeAuthorization(request.params.provider, request.query);
      response.cookie(SESSION_COOKIE, result.sessionToken, cookieOptions);
      const destination = new URL(result.returnTo, config.APP_BASE_URL);
      destination.searchParams.set("auth", "success");
      response.redirect(302, `${destination.pathname}${destination.search}${destination.hash}`);
    } catch (error) {
      const normalized = error instanceof AppError ? error : new AppError("AUTHORIZATION_FAILED", "Sign-in could not be completed. Please try again.", 502, true);
      logger.warn?.({ event: "oauth_callback_failed", provider: request.params.provider, code: normalized.code, correlationId: request.correlationId });
      response.redirect(302, `/?authError=${encodeURIComponent(normalized.code)}`);
    }
  });

  app.post("/api/v1/auth/logout", optionalSession, requireSession, requireCsrf, async (request, response, next) => {
    try {
      await authService.logout(request.cookies[SESSION_COOKIE]);
      const { maxAge: _maxAge, ...clearOptions } = cookieOptions;
      response.clearCookie(SESSION_COOKIE, clearOptions);
      response.status(204).end();
    } catch (error) { next(error); }
  });

  app.get("/api/v1/accounts", optionalSession, requireSession, async (request, response, next) => {
    try { response.json({ accounts: await authService.accounts(request.session.userId) }); } catch (error) { next(error); }
  });

  app.post("/api/v1/accounts/:id/reauthorize", optionalSession, requireSession, requireCsrf, async (request, response, next) => {
    try {
      const account = (await authService.accounts(request.session.userId)).find((item) => item.id === request.params.id);
      if (!account) throw new AppError("ACCOUNT_NOT_FOUND", "The connected account was not found.", 404, false);
      const authorizationUrl = await authService.beginAuthorization(account.provider, "/?view=settings", "consent");
      response.json({ authorizationUrl });
    } catch (error) { next(error); }
  });

  app.delete("/api/v1/accounts/:id", optionalSession, requireSession, requireCsrf, async (request, response, next) => {
    try { response.json(await authService.disconnect(request.session.userId, request.params.id)); } catch (error) { next(error); }
  });

  app.use("/api", (_request, _response, next) => next(new AppError("API_NOT_FOUND", "The requested API endpoint does not exist.", 404, false)));
  app.use(express.static(distPath, { extensions: ["html"] }));
  app.get("*", (_request, response) => response.sendFile(path.join(distPath, "index.html")));

  app.use((error, request, response, _next) => {
    const normalized = errorResponse(error, request.correlationId);
    logger.error?.({ event: "request_failed", code: normalized.body.error.code, correlationId: request.correlationId });
    response.status(normalized.status).json(normalized.body);
  });
  return app;
}
