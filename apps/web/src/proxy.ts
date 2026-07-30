// Keep proxy fast: only check presence of session cookie
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";
import { getPathLocale } from "./i18n/path-locale";
import { getSessionCookie } from "better-auth/cookies";

const intlMiddleware = createMiddleware(routing);
const AUTHENTICATED_ONLY = ["/dashboard", "/billing", "/settings", "/exams", "/profile/attempts"];

export function proxy(request: NextRequest) {
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
  matcher: ["/((?!api|_next|_vercel|static|.*\\..*).*)"],
};
