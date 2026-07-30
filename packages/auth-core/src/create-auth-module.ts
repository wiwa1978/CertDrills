import { betterAuth } from "better-auth";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import {
  errorCode,
  mobileRefreshRequestSchema,
  mobileRevokeRequestSchema,
  mobileTokenRequestSchema,
} from "@platform/contracts";
import { normalizeAuthRole } from "@platform/auth-shared";

import { createRequireAuth } from "./middleware/require-auth";
import { requireAdmin } from "./middleware/require-admin";
import { createRequireAdminAccess } from "./middleware/require-admin-access";
import { enforceMobileSignInGate } from "./mobile-sign-in-gate";
import { createTokenService } from "./token-service";
import type { AuthContextVariables, AuthModuleOptions } from "./types";

function redactAuthLogBody(body: string) {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;

    for (const key of ["email", "password", "newPassword", "token", "refreshToken", "accessToken"]) {
      if (key in parsed) {
        parsed[key] = "[redacted]";
      }
    }

    return JSON.stringify(parsed).slice(0, 200);
  } catch {
    return body.slice(0, 200);
  }
}

function invalidRefreshTokenResponse(c: { json: (body: unknown, status?: number) => Response }) {
  return c.json(
    {
      success: false,
      error: {
        code: errorCode.invalidRefreshToken,
        message: "Invalid refresh token",
      },
    },
    401,
  );
}

function reusedRefreshTokenResponse(c: { json: (body: unknown, status?: number) => Response }) {
  return c.json(
    {
      success: false,
      error: {
        code: errorCode.refreshTokenReused,
        message: "Refresh token has already been used",
      },
    },
    401,
  );
}

function gateInputForUser(user: NonNullable<Awaited<ReturnType<AuthModuleOptions["users"]["findById"]>>>) {
  return {
    emailVerified: user.emailVerified ?? false,
    twoFactorEnabled: user.twoFactorEnabled ?? false,
    banned: user.banned ?? false,
    banExpires: user.banExpires ?? null,
  };
}

export function createAuthModule(options: AuthModuleOptions) {
  const auth = betterAuth(options.betterAuthOptions);
  const router = new Hono<{ Variables: AuthContextVariables }>();
  const tokenService = createTokenService({
    secret: options.jwt.secret,
    issuer: options.jwt.issuer,
    audience: options.jwt.audience,
    accessTokenTtlSeconds: options.jwt.accessTokenTtlSeconds,
  });

  const requireAuth = createRequireAuth(async (headers) => {
    const authorization = headers.get("authorization");
    if (authorization?.startsWith("Bearer ")) {
      const token = authorization.slice("Bearer ".length).trim();

      if (token) {
        const verified = await tokenService.verifyAccessToken(token).catch(() => null);
        if (!verified) {
          return {
            ok: false,
            status: 401,
            error: "Invalid access token",
            errorCode: errorCode.unauthorized,
          };
        }

        const { userId } = verified;
        const tokenUser = await options.users.findById(userId);

        if (!tokenUser) {
          return {
            ok: false,
            status: 401,
            error: "Invalid access token",
            errorCode: errorCode.unauthorized,
          };
        }

        const gate = enforceMobileSignInGate(gateInputForUser(tokenUser));
        if (!gate.ok) {
          return {
            ok: false,
            status: gate.status,
            error: gate.error,
            errorCode: gate.errorCode,
          };
        }

        return {
          user: tokenUser,
          session: null,
        };
      }
    }

    const session = (await auth.api.getSession({ headers })) as
      | {
          user?: { id?: string; role?: string | null; email?: string | null; twoFactorEnabled?: boolean | null };
          session?: unknown;
        }
      | null;

    if (!session?.user?.id) {
      return session;
    }

    const persistedUser = await options.users.findById(session.user.id);
    if (!persistedUser) {
      return null;
    }

    return {
      user: {
        ...persistedUser,
        twoFactorEnabled: session.user.twoFactorEnabled ?? persistedUser.twoFactorEnabled ?? null,
      },
      session: session.session ?? null,
    };
  });
  const requireAdminAccess = createRequireAdminAccess({
    allowlist: options.admin.allowlist,
  });

  router.on(["GET", "POST", "OPTIONS"], "/*", async (c) => {
    const response = await auth.handler(c.req.raw);

    if (response.status >= 400) {
      const responseBody = await response.clone().text();
      console.error("[auth-core] Auth request failed", {
        method: c.req.method,
        path: c.req.path,
        status: response.status,
        body: redactAuthLogBody(responseBody),
      });
    }

    return response;
  });

  const sessionRouter = new Hono<{ Variables: AuthContextVariables }>();
  sessionRouter.use("/*", requireAuth);
  sessionRouter.get("/me", (c) => {
    const authUser = c.get("authUser") as { id: string; role?: string | null; email?: string | null };
    return c.json({
      success: true,
      data: {
        ...authUser,
        role: normalizeAuthRole(authUser.role),
      },
    });
  });
  sessionRouter.get("/admin/me", requireAdminAccess, (c) => {
    const authUser = c.get("authUser") as { id: string; role?: string | null; email?: string | null };
    return c.json({
      success: true,
      data: {
        ...authUser,
        role: normalizeAuthRole(authUser.role),
      },
    });
  });

  const mobileRouter = new Hono<{ Variables: AuthContextVariables }>();
  mobileRouter.post("/token", zValidator("json", mobileTokenRequestSchema), async (c) => {
    const body = c.req.valid("json");

    const signInResult = (await (auth.api as any).signInEmail({
      body: {
        email: body.email,
        password: body.password,
      },
      asResponse: false,
    })) as { user?: { id?: string } };

    const userId = signInResult?.user?.id;
    if (!userId) {
      return c.json(
        {
          success: false,
          error: {
            code: errorCode.invalidCredentials,
            message: "Invalid credentials",
          },
        },
        401,
      );
    }

    // Re-load the persisted user so the gate evaluates the authoritative
    // emailVerified / twoFactorEnabled / banned flags rather than whatever
    // shape better-auth returned. Same gate is used for the future social
    // login mobile path (see enforceMobileSignInGate).
    const persistedUser = await options.users.findById(userId);
    if (!persistedUser) {
      return c.json(
        {
          success: false,
          error: {
            code: errorCode.invalidCredentials,
            message: "Invalid credentials",
          },
        },
        401,
      );
    }

    const gate = enforceMobileSignInGate(gateInputForUser(persistedUser));

    if (!gate.ok) {
      return c.json(
        {
          success: false,
          error: {
            code: gate.errorCode,
            message: gate.error,
          },
        },
        gate.status,
      );
    }

    await options.refreshTokens.cleanupExpired();
    const accessToken = await tokenService.signAccessToken(userId);
    const refreshToken = tokenService.createRefreshToken();
    const refreshTokenHash = tokenService.hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + options.jwt.refreshTokenTtlSeconds * 1000);

    await options.refreshTokens.create({
      tokenHash: refreshTokenHash,
      userId,
      expiresAt,
    });

    return c.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        expiresInSeconds: options.jwt.accessTokenTtlSeconds,
        tokenType: "Bearer",
      },
    });
  });

  mobileRouter.post("/refresh", zValidator("json", mobileRefreshRequestSchema), async (c) => {
    await options.refreshTokens.cleanupExpired();
    const body = c.req.valid("json");
    const currentTokenHash = tokenService.hashRefreshToken(body.refreshToken);
    const existing = await options.refreshTokens.findActiveByHash(currentTokenHash);

    if (!existing) {
      return invalidRefreshTokenResponse(c);
    }

    const persistedUser = await options.users.findById(existing.userId);
    if (!persistedUser) {
      return invalidRefreshTokenResponse(c);
    }

    const gate = enforceMobileSignInGate(gateInputForUser(persistedUser));
    if (!gate.ok) {
      return c.json(
        {
          success: false,
          error: {
            code: gate.errorCode,
            message: gate.error,
          },
        },
        gate.status,
      );
    }

    const nextRefreshToken = tokenService.createRefreshToken();
    const nextRefreshTokenHash = tokenService.hashRefreshToken(nextRefreshToken);

    const rotated = await options.refreshTokens.rotate({
      currentTokenHash,
      nextTokenHash: nextRefreshTokenHash,
      userId: existing.userId,
      nextExpiresAt: new Date(Date.now() + options.jwt.refreshTokenTtlSeconds * 1000),
    });

    if (!rotated) {
      return reusedRefreshTokenResponse(c);
    }

    const accessToken = await tokenService.signAccessToken(existing.userId);

    return c.json({
      success: true,
      data: {
        accessToken,
        refreshToken: nextRefreshToken,
        expiresInSeconds: options.jwt.accessTokenTtlSeconds,
        tokenType: "Bearer",
      },
    });
  });

  mobileRouter.post("/revoke", zValidator("json", mobileRevokeRequestSchema), async (c) => {
    const body = c.req.valid("json");
    await options.refreshTokens.revokeByHash(tokenService.hashRefreshToken(body.refreshToken));
    return c.json({ success: true, data: { revoked: true } });
  });

  return {
    auth,
    router,
    sessionRouter,
    mobileRouter,
    requireAuth,
    requireAdmin,
    requireAdminAccess,
  };
}
