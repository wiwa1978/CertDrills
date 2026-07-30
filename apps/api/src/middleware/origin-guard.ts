import type { MiddlewareHandler } from "hono";

import { errorCode } from "@platform/contracts/wire";

import type { AppEnv } from "../context";
import { env } from "../env";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SESSION_COOKIE_NAMES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

function configuredOrigins() {
  return [
    env.APP_URL,
    env.API_URL,
    env.ADMIN_APP_URL,
    ...(env.BETTER_AUTH_ALLOWED_ORIGINS?.split(",").map((item) => item.trim()).filter(Boolean) ?? []),
  ].filter((origin): origin is string => Boolean(origin));
}

const trustedOrigins = new Set(configuredOrigins());

function isWebhookPath(path: string) {
  return path === "/payments/webhooks/dodo" || path.startsWith("/payments/webhooks/");
}

function isBearerRequest(authorization: string | undefined) {
  return authorization?.trim().toLowerCase().startsWith("bearer ") === true;
}

function hasSessionCookie(cookieHeader: string | undefined) {
  if (!cookieHeader) return false;

  return cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .some((cookie) => SESSION_COOKIE_NAMES.some((name) => cookie.startsWith(`${name}=`)));
}

function originFromReferer(referer: string | undefined) {
  if (!referer) return null;

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function isTrustedRequestOrigin(headers: Headers) {
  const origin = headers.get("origin");
  if (origin) {
    return trustedOrigins.has(origin);
  }

  const refererOrigin = originFromReferer(headers.get("referer") ?? undefined);
  return Boolean(refererOrigin && trustedOrigins.has(refererOrigin));
}

export const originGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  const method = c.req.method.toUpperCase();

  if (!UNSAFE_METHODS.has(method) || isWebhookPath(c.req.path)) {
    return next();
  }

  if (isBearerRequest(c.req.header("authorization")) || !hasSessionCookie(c.req.header("cookie"))) {
    return next();
  }

  if (!isTrustedRequestOrigin(c.req.raw.headers)) {
    return c.json(
      {
        success: false,
        error: {
          code: errorCode.forbidden,
          message: "Forbidden origin",
        },
      },
      403,
    );
  }

  return next();
};
