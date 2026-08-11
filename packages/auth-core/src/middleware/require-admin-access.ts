import { hasAdminAccess, normalizeAuthEmail } from "@platform/auth-shared";
import { errorCode } from "@platform/contracts/wire";

import type { AuthMiddleware, AuthUserRecord } from "../types";

type AuthUser = {
  role?: string | null;
  email?: string | null;
  twoFactorEnabled?: boolean | null;
};

type RequireAdminAccessOptions = {
  allowlist: Set<string>;
  totpRequired: boolean;
  users: {
    findById: (userId: string) => Promise<AuthUserRecord | null>;
  };
};

function impersonatingUserId(session: unknown) {
  if (typeof session !== "object" || session === null || !("impersonatedBy" in session)) return null;
  const impersonatedBy = (session as { impersonatedBy?: unknown }).impersonatedBy;
  return typeof impersonatedBy === "string" && impersonatedBy.trim().length > 0 ? impersonatedBy.trim() : null;
}

export function createRequireAdminAccess(options: RequireAdminAccessOptions): AuthMiddleware {
  return async (c, next) => {
    const user = c.get("authUser") as AuthUser | undefined;
    let adminUser = user;
    const hasDirectAccess = hasAdminAccess(user) && options.allowlist.has(normalizeAuthEmail(user?.email));

    if (!hasDirectAccess) {
      const actorId = impersonatingUserId(c.get("authSession"));
      adminUser = actorId ? await options.users.findById(actorId) ?? undefined : undefined;
    }

    if (!hasAdminAccess(adminUser) || !options.allowlist.has(normalizeAuthEmail(adminUser?.email))) {
      const response = c.json(
        {
          success: false,
          error: {
            code: errorCode.forbidden,
            message: "Forbidden",
          },
          invalidateSession: true,
          redirectTo: "/login?reason=forbidden-admin",
        },
        403,
      );

      response.headers.set("x-auth-invalidate", "1");
      return response;
    }

    if (options.totpRequired && adminUser?.twoFactorEnabled !== true) {
      return c.json(
        {
          success: false,
          error: {
            code: errorCode.twoFactorRequired,
            message: "Admin two-factor authentication is required.",
          },
          redirectTo: "/settings?reason=totp-required",
        },
        403,
      );
    }

    await next();
  };
}
