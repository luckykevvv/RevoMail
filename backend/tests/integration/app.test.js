import path from "node:path";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { AppError } from "../../src/utils/errors.js";

function appFixture(overrides = {}) {
  const session = { id: "session-1", userId: "user-1", csrfHash: "hash", user: { id: "user-1", email: "safe@example.test", displayName: "Safe User", avatarUrl: null } };
  const authService = {
    authenticate: vi.fn(async (token) => token === "valid" ? session : null),
    providerStatus: vi.fn(() => ({ google: true, microsoft: false })),
    issueCsrf: vi.fn(async () => "csrf-token"),
    assertCsrf: vi.fn((_session, token) => { if (token !== "csrf-token") throw new AppError("INVALID_CSRF_TOKEN", "The request could not be verified.", 403, true); }),
    logout: vi.fn(),
    accounts: vi.fn(async () => []),
    beginAuthorization: vi.fn(async () => "https://provider.example/authorize"),
    completeAuthorization: vi.fn(),
    disconnect: vi.fn(async () => ({ disconnected: true })),
    ...overrides
  };
  return { app: createApp({ authService, config: { NODE_ENV: "test", APP_BASE_URL: "http://localhost" }, distPath: path.resolve("dist"), healthCheck: async () => true, logger: { error: vi.fn(), warn: vi.fn() } }), authService };
}

describe("authentication HTTP API", () => {
  it("returns health without configuration or secrets", async () => {
    const { app } = appFixture();
    const response = await request(app).get("/api/v1/health").expect(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("returns provider status to signed-out clients", async () => {
    const { app } = appFixture();
    const response = await request(app).get("/api/v1/auth/session").expect(200);
    expect(response.body).toEqual({ authenticated: false, providers: { google: true, microsoft: false } });
  });

  it("returns only safe session fields and a CSRF token", async () => {
    const { app } = appFixture();
    const response = await request(app).get("/api/v1/auth/session").set("Cookie", "rv_session=valid").expect(200);
    expect(response.body.user.email).toBe("safe@example.test");
    expect(response.body.csrfToken).toBe("csrf-token");
    expect(JSON.stringify(response.body)).not.toMatch(/access.?token|refresh.?token/i);
  });

  it("requires authentication and CSRF for mutations", async () => {
    const { app } = appFixture();
    await request(app).post("/api/v1/auth/logout").expect(401);
    await request(app).post("/api/v1/auth/logout").set("Cookie", "rv_session=valid").expect(403);
    await request(app).post("/api/v1/auth/logout").set("Cookie", "rv_session=valid").set("x-csrf-token", "csrf-token").expect(204);
  });
});
