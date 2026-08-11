import { and, eq, isNotNull, lt, or } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";

import { errorCode } from "@platform/contracts/wire";
import { createPlatformDb, user, type ApiKeyScope } from "@platform/platform-db";

import type { AppEnv } from "../context";
import type { createApiKeysService } from "../modules/api-keys/service";

type PlatformDb = ReturnType<typeof createPlatformDb>["db"];
type ApiKeysService = ReturnType<typeof createApiKeysService>;

const apiKeyRoutes: Array<{ method: string; pattern: RegExp; scope: ApiKeyScope }> = [
  { method: "GET", pattern: /^\/me\/(?:session|application-config|profile-address)$/, scope: "read:profile" },
  { method: "GET", pattern: /^\/me\/credits\/(?:balance|history|purchases)$/, scope: "read:credits" },
  { method: "GET", pattern: /^\/me\/(?:subscription(?:\/payments)?|transaction-orders(?:\/[^/]+)?|transaction-entitlements)$/, scope: "read:billing" },
];

function errorResponse(c: Parameters<MiddlewareHandler<AppEnv>>[0], status: 401 | 403, code: string, message: string) {
  return c.json({ success: false, error: { code, message } }, status);
}

export function createApiKeyOrSessionAuth(options: {
  db: PlatformDb;
  apiKeysService: ApiKeysService;
  sessionAuth: MiddlewareHandler<AppEnv>;
}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const authorization = c.req.header("authorization");
    const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

    if (!bearer?.startsWith("sk_")) {
      return options.sessionAuth(c, next);
    }

    const authentication = await options.apiKeysService.authenticate(bearer);
    if (!authentication) {
      return errorResponse(c, 401, errorCode.unauthorized, "Invalid API key");
    }

    const requiredScope = apiKeyRoutes.find(({ method, pattern }) => method === c.req.method && pattern.test(c.req.path))?.scope;
    if (!requiredScope || !authentication.scopes.includes(requiredScope)) {
      return errorResponse(c, 403, errorCode.forbidden, "API key scope does not permit this operation");
    }

    const now = new Date();
    const [authenticatedUser] = await options.db
      .select({
        id: user.id,
        role: user.role,
        email: user.email,
        twoFactorEnabled: user.twoFactorEnabled,
      })
      .from(user)
      .where(and(
        eq(user.id, authentication.userId),
        or(eq(user.banned, false), and(eq(user.banned, true), isNotNull(user.banExpires), lt(user.banExpires, now))),
      ))
      .limit(1);

    if (!authenticatedUser) {
      return errorResponse(c, 401, errorCode.unauthorized, "Invalid API key");
    }

    c.set("authUser", {
      ...authenticatedUser,
      role: authenticatedUser.role === "admin" ? "admin" : "user",
    });
    c.set("apiKeyScopes", authentication.scopes);
    await next();
  };
}
