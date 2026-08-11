import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "../context";
import { env } from "../env";

function buildCsp(path: string) {
  if (path === "/api/swagger" || path === "/api/docs") {
    return [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com",
      "img-src 'self' data: https:",
      "connect-src 'self'",
    ].join("; ");
  }

  return [
    "default-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "form-action 'none'",
  ].join("; ");
}

export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();

  c.header("content-security-policy", buildCsp(c.req.path));
  c.header("x-frame-options", "DENY");
  c.header("x-content-type-options", "nosniff");
  c.header("referrer-policy", "no-referrer");
  c.header("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  c.header("cross-origin-resource-policy", "same-site");

  if (env.NODE_ENV === "production") {
    c.header("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
};
