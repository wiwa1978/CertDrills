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

const adminCorsOrigins = new Set(env.ADMIN_APP_URL ? [env.ADMIN_APP_URL] : []);
const appUrlHostname = new URL(env.APP_URL).hostname;

function isAdminPath(path: string) {
  return path === "/admin" || path.startsWith("/admin/") || path.startsWith("/auth/admin/");
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
      return isAdminPath(c.req.path) ? (env.ADMIN_APP_URL ?? null) : env.APP_URL;
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
