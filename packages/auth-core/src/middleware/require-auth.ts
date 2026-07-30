import { normalizeAuthRole } from "@platform/auth-shared";
import { errorCode } from "@platform/contracts/wire";

import type { AuthFailure, AuthMiddleware } from "../types";

type SessionShape = {
  user?: {
    id?: string;
    role?: string | null;
    email?: string | null;
    twoFactorEnabled?: boolean | null;
  };
  session?: unknown;
};

type TokenUser = {
  id: string;
  role?: string | null;
  email?: string | null;
  twoFactorEnabled?: boolean | null;
};

type GetAuthContext = (headers: Headers) => Promise<SessionShape | { user: TokenUser; session: null } | AuthFailure | null>;

function isAuthFailure(value: Awaited<ReturnType<GetAuthContext>>): value is AuthFailure {
  return Boolean(value && "ok" in value && value.ok === false);
}

export function createRequireAuth(getAuthContext: GetAuthContext): AuthMiddleware {
  return async (c, next) => {
    const session = await getAuthContext(c.req.raw.headers);

    if (isAuthFailure(session)) {
      return c.json(
        {
          success: false,
          error: {
            code: session.errorCode ?? errorCode.unauthorized,
            message: session.error,
          },
        },
        session.status,
      );
    }

    if (!session?.user?.id) {
      return c.json({ success: false, error: { code: errorCode.unauthorized, message: "Unauthorized" } }, 401);
    }

    c.set("authUser", {
      id: session.user.id,
      role: normalizeAuthRole(session.user.role),
      email: session.user.email ?? null,
      twoFactorEnabled: session.user.twoFactorEnabled ?? null,
    });
    c.set("authSession", session.session ?? null);
    await next();
  };
}
