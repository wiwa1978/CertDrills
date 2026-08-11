// Keep proxy fast: only check presence of session cookie
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";
import { getPathLocale } from "./i18n/path-locale";
import { getSessionCookie } from "better-auth/cookies";

const intlMiddleware = createMiddleware(routing);
const AUTHENTICATED_ONLY = ["/dashboard", "/billing", "/settings"];

function requestHost(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim();
  return forwardedHost || request.headers.get("host") || request.nextUrl.host;
}

function canonicalRedirect(request: NextRequest) {
  if (process.env.NODE_ENV !== "production" || !process.env.NEXT_PUBLIC_APP_URL) return null;

  const canonicalOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL);
  if (requestHost(request) === canonicalOrigin.host) return null;

  return NextResponse.redirect(
    new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, canonicalOrigin),
    308,
  );
}

export function proxy(request: NextRequest) {
  const canonicalResponse = canonicalRedirect(request);
  if (canonicalResponse) return canonicalResponse;

  const { pathname, search } = request.nextUrl;
  const { activeLocale, pathWithoutLocale } = getPathLocale(pathname);

  // fast cookie-only check (no DB)
  const rawCookie = getSessionCookie(request);
  const isAuthenticated = !!rawCookie;

  const needsAuth = AUTHENTICATED_ONLY.some(
    (p) => pathWithoutLocale === p || pathWithoutLocale.startsWith(p + "/")
  );

  if (needsAuth && !isAuthenticated) {
    const loginUrl = new URL(`/${activeLocale}/login`, request.url);
    loginUrl.searchParams.set("callbackUrl", pathname + (search ?? ""));
    return NextResponse.redirect(loginUrl);
  }

  return intlMiddleware(request as unknown as Parameters<typeof intlMiddleware>[0]);
}

export const config = {
  matcher: ["/((?!api|health|ready|_next|_vercel|static|.*\\..*).*)"],
};
