import { cors } from "hono/cors";

import type { AppEnv } from "../context";
import { env } from "../env";

const publicCorsOrigins = new Set(
  [
    env.APP_URL,
    env.API_URL,
    ...(env.BETTER_AUTH_ALLOWED_ORIGINS
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? []),
  ],
);

const adminAppUrl = env.ADMIN_APP_URL;
if (!adminAppUrl) throw new Error("ADMIN_APP_URL is required for admin CORS");

const adminCorsOrigins = new Set([adminAppUrl]);
const appUrlHostname = new URL(env.APP_URL).hostname;

function isAdminPath(path: string) {
  return path === "/admin" || path.startsWith("/admin/") || path.startsWith("/auth/admin/") || path === "/admin-auth" || path.startsWith("/admin-auth/");
}

function isAllowedCorsOrigin(origin: string, path: string) {
  const adminPath = isAdminPath(path);
  const allowedOrigins = adminPath ? adminCorsOrigins : publicCorsOrigins;

  if (allowedOrigins.has(origin)) {
    return true;
  }

  if (adminPath) {
    return false;
  }

  if (env.NODE_ENV !== "production") {
    try {
      const parsedOrigin = new URL(origin);

      // In development we accept localhost and same-hostname variants so local web/admin apps can hit the API.
      return (
        parsedOrigin.hostname === appUrlHostname
        || parsedOrigin.hostname === "localhost"
        || parsedOrigin.hostname === "127.0.0.1"
      );
    } catch {
      return false;
    }
  }

  return false;
}

export const corsMiddleware = cors({
  origin: (origin, c) => {
    if (!origin) {
      return isAdminPath(c.req.path) ? adminAppUrl : env.APP_URL;
    }

    return isAllowedCorsOrigin(origin, c.req.path) ? origin : null;
  },
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: [
    "Content-Type",
    "Authorization",
    "Accept",
    "Origin",
    "X-Requested-With",
    "x-better-auth-client",
    "x-captcha-response",
  ],
  exposeHeaders: ["Content-Length", "Set-Cookie"],
  credentials: true,
});
