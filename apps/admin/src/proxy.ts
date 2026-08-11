// Keep proxy fast: only check presence of session cookie
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";
import { getPathLocale } from "./i18n/path-locale";
import { getSessionCookie } from "better-auth/cookies";

const intlMiddleware = createMiddleware(routing);
const ADMIN_ONLY = ["/admin", "/dashboard", "/settings", "/billing"];

function canonicalRedirect(request: NextRequest) {
  if (process.env.NODE_ENV !== "production" || !process.env.NEXT_PUBLIC_APP_URL) return null;

  const canonicalOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL);
  if (request.nextUrl.origin === canonicalOrigin.origin) return null;

  return NextResponse.redirect(
    new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, canonicalOrigin),
    308,
  );
}

function adminLoginUrl(request: NextRequest, locale: string) {
  return new URL(`/${locale}/login`, request.url);
}

export async function proxy(request: NextRequest) {
  const canonicalResponse = canonicalRedirect(request);
  if (canonicalResponse) return canonicalResponse;

  const { pathname, search } = request.nextUrl;
  const { activeLocale, pathWithoutLocale } = getPathLocale(pathname);

  // fast cookie-only check (no DB)
  const rawCookie = getSessionCookie(request, { cookiePrefix: "better-auth-admin" });
  const isAuthenticated = !!rawCookie;

  const isAdminRoute = ADMIN_ONLY.some(
    (p) => pathWithoutLocale === p || pathWithoutLocale.startsWith(p + "/"),
  );

  if (isAdminRoute && !isAuthenticated) {
    const loginUrl = new URL(`/${activeLocale}/login`, request.url);
    loginUrl.searchParams.set("callbackUrl", pathname + (search ?? ""));
    return NextResponse.redirect(loginUrl);
  }

  if (isAdminRoute && isAuthenticated) {
    const headers = new Headers();
    headers.set("cookie", request.headers.get("cookie") || "");

    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiBaseUrl) {
      return NextResponse.redirect(adminLoginUrl(request, activeLocale));
    }

    const sessionUrl = `${apiBaseUrl.replace(/\/$/, "")}/admin/status`;
    try {
      const res = await fetch(sessionUrl, { headers, cache: "no-store" });
      if (!res.ok) {
        return NextResponse.redirect(adminLoginUrl(request, activeLocale));
      }

      return intlMiddleware(request as unknown as Parameters<typeof intlMiddleware>[0]);
    } catch {
      return NextResponse.redirect(adminLoginUrl(request, activeLocale));
    }
  }

  return intlMiddleware(request as unknown as Parameters<typeof intlMiddleware>[0]);
}

export const config = {
  matcher: ["/((?!api|health|ready|_next|_vercel|static|.*\\..*).*)"],
};
