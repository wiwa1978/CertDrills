import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock ONLY the betterAuth() factory so we can stub auth.api.signInEmail
// without standing up a real Postgres + better-auth instance. The real
// `createAuthModule` (gate, route handler, token service, validators) still
// runs unmodified — this is what the previous wholesale `@platform/auth-core`
// mock was hiding.
const mocks = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  getSession: vi.fn(async () => null),
  authHandler: vi.fn(async () => new Response(null, { status: 200 })),
}));

vi.mock("better-auth", () => ({
  betterAuth: () => ({
    api: { getSession: mocks.getSession, signInEmail: mocks.signInEmail },
    handler: mocks.authHandler,
  }),
}));

import { createAuthModule } from "@platform/auth-core";

type FindByIdResult = Awaited<ReturnType<Parameters<typeof createAuthModule>[0]["users"]["findById"]>>;
type RefreshTokenRecord = Awaited<ReturnType<Parameters<typeof createAuthModule>[0]["refreshTokens"]["findActiveByHash"]>>;

function buildApp(opts: {
  findById: () => FindByIdResult;
  findActiveRefreshToken?: () => RefreshTokenRecord;
  rotateRefreshToken?: () => boolean | Promise<boolean>;
}) {
  const refreshTokens = {
    create: vi.fn(async () => {}),
    findActiveByHash: vi.fn(async () => opts.findActiveRefreshToken?.() ?? null),
    rotate: vi.fn(async () => opts.rotateRefreshToken?.() ?? true),
    revokeByHash: vi.fn(async () => {}),
    cleanupExpired: vi.fn(async () => {}),
  };

  const module = createAuthModule({
    betterAuthOptions: {} as never,
    users: {
      findById: vi.fn(async () => opts.findById()),
    },
    admin: { allowlist: new Set() },
    jwt: {
      secret: "x".repeat(64),
      issuer: "test-issuer",
      audience: "test-audience",
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 3600,
    },
    refreshTokens,
  });

  const app = new Hono();
  app.route("/auth/mobile", module.mobileRouter);
  app.route("/session", module.sessionRouter);
  return { app, refreshTokens };
}

const baseUser = {
  id: "11111111-1111-1111-1111-111111111111",
  role: "user",
  email: "user@example.com",
  emailVerified: true,
  twoFactorEnabled: false,
  banned: false,
  banExpires: null,
};

function expectApiErrorCode(code: string) {
  return {
    success: false,
    error: expect.objectContaining({ code }),
  };
}

describe("POST /auth/mobile/token gate", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.getSession.mockResolvedValue(null);
    mocks.signInEmail.mockReset();
    mocks.signInEmail.mockResolvedValue({ user: { id: baseUser.id } });
  });

  async function call(app: Hono) {
    return app.request("/auth/mobile/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: "password123" }),
    });
  }

  it("401 INVALID_CREDENTIALS when better-auth refuses sign-in", async () => {
    mocks.signInEmail.mockResolvedValueOnce({});
    const { app, refreshTokens } = buildApp({ findById: () => baseUser });
    const res = await call(app);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject(expectApiErrorCode("INVALID_CREDENTIALS"));
    expect(refreshTokens.create).not.toHaveBeenCalled();
  });

  it("403 EMAIL_NOT_VERIFIED when account email is unverified", async () => {
    const { app, refreshTokens } = buildApp({
      findById: () => ({ ...baseUser, emailVerified: false }),
    });
    const res = await call(app);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject(expectApiErrorCode("EMAIL_NOT_VERIFIED"));
    // CRITICAL: no refresh token persisted for an ungated user
    expect(refreshTokens.create).not.toHaveBeenCalled();
  });

  it("403 TWO_FACTOR_REQUIRED when account has 2FA enabled", async () => {
    const { app, refreshTokens } = buildApp({
      findById: () => ({ ...baseUser, twoFactorEnabled: true }),
    });
    const res = await call(app);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject(expectApiErrorCode("TWO_FACTOR_REQUIRED"));
    expect(refreshTokens.create).not.toHaveBeenCalled();
  });

  it("403 ACCOUNT_BANNED for banned accounts", async () => {
    const { app, refreshTokens } = buildApp({
      findById: () => ({ ...baseUser, banned: true }),
    });
    const res = await call(app);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject(expectApiErrorCode("ACCOUNT_BANNED"));
    expect(refreshTokens.create).not.toHaveBeenCalled();
  });

  it("401 INVALID_CREDENTIALS when persisted user has been deleted between signIn and findById", async () => {
    const { app, refreshTokens } = buildApp({ findById: () => null });
    const res = await call(app);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject(expectApiErrorCode("INVALID_CREDENTIALS"));
    expect(refreshTokens.create).not.toHaveBeenCalled();
  });

  it("200 issues tokens for a fully verified, un-2FA, un-banned user", async () => {
    const { app, refreshTokens } = buildApp({ findById: () => baseUser });
    const res = await call(app);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { accessToken: string; refreshToken: string; tokenType: string };
    };
    expect(body.success).toBe(true);
    expect(body.data.tokenType).toBe("Bearer");
    expect(body.data.accessToken.length).toBeGreaterThan(16);
    expect(body.data.refreshToken.length).toBeGreaterThan(16);
    expect(refreshTokens.create).toHaveBeenCalledOnce();
  });
});

describe("bearer-token auth lifecycle gate", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.getSession.mockResolvedValue(null);
    mocks.signInEmail.mockReset();
    mocks.signInEmail.mockResolvedValue({ user: { id: baseUser.id } });
  });

  async function issueAccessToken(findById: () => FindByIdResult = () => baseUser) {
    const { app } = buildApp({ findById });
    const res = await callMobileToken(app);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { accessToken: string } };
    return body.data.accessToken;
  }

  async function callSession(app: Hono, accessToken: string) {
    return app.request("/session/me", {
      headers: { authorization: `Bearer ${accessToken}` },
    });
  }

  async function callMobileToken(app: Hono) {
    return app.request("/auth/mobile/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: "password123" }),
    });
  }

  it("401 UNAUTHORIZED for malformed bearer token instead of throwing", async () => {
    const { app } = buildApp({ findById: () => baseUser });

    const res = await callSession(app, "not-a-jwt");

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject(expectApiErrorCode("UNAUTHORIZED"));
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("401 UNAUTHORIZED when bearer user was deleted after token issuance", async () => {
    const accessToken = await issueAccessToken();
    const { app } = buildApp({ findById: () => null });

    const res = await callSession(app, accessToken);

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject(expectApiErrorCode("UNAUTHORIZED"));
  });

  it("403 ACCOUNT_BANNED when bearer user was banned after token issuance", async () => {
    const accessToken = await issueAccessToken();
    const { app } = buildApp({ findById: () => ({ ...baseUser, banned: true }) });

    const res = await callSession(app, accessToken);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject(expectApiErrorCode("ACCOUNT_BANNED"));
  });
});

describe("cookie-session auth lifecycle gate", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.signInEmail.mockReset();
  });

  it("uses the persisted user instead of stale session user fields", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: baseUser.id, role: "admin", email: "stale-admin@example.com" },
      session: { id: "session-1" },
    });
    const { app } = buildApp({ findById: () => ({ ...baseUser, role: "user", email: "fresh-user@example.com" }) });

    const res = await app.request("/session/me", {
      headers: { cookie: "better-auth.session_token=session-token" },
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      data: {
        id: baseUser.id,
        role: "user",
        email: "fresh-user@example.com",
      },
    });
  });

  it("rejects cookie sessions whose user no longer exists", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: baseUser.id, role: "admin", email: "stale-admin@example.com" },
      session: { id: "session-1" },
    });
    const { app } = buildApp({ findById: () => null });

    const res = await app.request("/session/me", {
      headers: { cookie: "better-auth.session_token=session-token" },
    });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject(expectApiErrorCode("UNAUTHORIZED"));
  });
});

describe("POST /auth/mobile/refresh lifecycle gate", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.getSession.mockResolvedValue(null);
    mocks.signInEmail.mockReset();
    mocks.signInEmail.mockResolvedValue({ user: { id: baseUser.id } });
  });

  async function callRefresh(app: Hono) {
    return app.request("/auth/mobile/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: "r".repeat(32) }),
    });
  }

  it("401 INVALID_REFRESH_TOKEN when refresh token is missing or inactive", async () => {
    const { app, refreshTokens } = buildApp({ findById: () => baseUser });

    const res = await callRefresh(app);

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject(expectApiErrorCode("INVALID_REFRESH_TOKEN"));
    expect(refreshTokens.rotate).not.toHaveBeenCalled();
  });

  it("401 INVALID_REFRESH_TOKEN when refresh token user was deleted", async () => {
    const { app, refreshTokens } = buildApp({
      findById: () => null,
      findActiveRefreshToken: () => ({ userId: baseUser.id }),
    });

    const res = await callRefresh(app);

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject(expectApiErrorCode("INVALID_REFRESH_TOKEN"));
    expect(refreshTokens.rotate).not.toHaveBeenCalled();
  });

  it("403 ACCOUNT_BANNED when refresh token user is banned", async () => {
    const { app, refreshTokens } = buildApp({
      findById: () => ({ ...baseUser, banned: true }),
      findActiveRefreshToken: () => ({ userId: baseUser.id }),
    });

    const res = await callRefresh(app);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject(expectApiErrorCode("ACCOUNT_BANNED"));
    expect(refreshTokens.rotate).not.toHaveBeenCalled();
  });

  it("401 REFRESH_TOKEN_REUSED when rotation loses the race", async () => {
    const { app } = buildApp({
      findById: () => baseUser,
      findActiveRefreshToken: () => ({ userId: baseUser.id }),
      rotateRefreshToken: () => false,
    });

    const res = await callRefresh(app);

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject(expectApiErrorCode("REFRESH_TOKEN_REUSED"));
  });

  it("200 rotates refresh token for eligible users", async () => {
    const { app, refreshTokens } = buildApp({
      findById: () => baseUser,
      findActiveRefreshToken: () => ({ userId: baseUser.id }),
    });

    const res = await callRefresh(app);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      data: {
        tokenType: "Bearer",
      },
    });
    expect(refreshTokens.rotate).toHaveBeenCalledOnce();
  });
});
