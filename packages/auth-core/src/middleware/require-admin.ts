import { hasAdminAccess } from "@platform/auth-shared";
import { errorCode } from "@platform/contracts/wire";
import type { AuthMiddleware } from "../types";

export const requireAdmin: AuthMiddleware = async (c, next) => {
  const user = c.get("authUser") as { role?: string | null } | undefined;

  if (!hasAdminAccess(user)) {
    return c.json({ success: false, error: { code: errorCode.forbidden, message: "Forbidden" } }, 403);
  }

  await next();
};
