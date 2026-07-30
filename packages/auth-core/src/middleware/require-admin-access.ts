import { authConfig, hasAdminAccess, normalizeAuthEmail } from "@platform/auth-shared";
import { errorCode } from "@platform/contracts/wire";

import type { AuthMiddleware } from "../types";

type AuthUser = {
  role?: string | null;
  email?: string | null;
  twoFactorEnabled?: boolean | null;
};

type RequireAdminAccessOptions = {
  allowlist: Set<string>;
};

export function createRequireAdminAccess(options: RequireAdminAccessOptions): AuthMiddleware {
  return async (c, next) => {
    const user = c.get("authUser") as AuthUser | undefined;
    const email = normalizeAuthEmail(user?.email);
    const isAllowedEmail = options.allowlist.has(email);

    if (!hasAdminAccess(user) || !isAllowedEmail) {
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

    if (authConfig.adminPortalTotpRequired && user?.twoFactorEnabled !== true) {
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
