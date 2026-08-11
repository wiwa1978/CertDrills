import "server-only";

import { cookies } from "next/headers";

import { env } from "@/env";
import { createApiRequest, normalizeBaseUrl } from "@platform/frontend-shared";

const API_BASE_URL = normalizeBaseUrl(env.NEXT_PUBLIC_API_URL || env.NEXT_PUBLIC_APP_URL);

async function getServerCookieHeaders() {
  const cookieHeader = (await cookies()).toString();
  return cookieHeader.length > 0 ? { cookie: cookieHeader } : undefined;
}

const request = createApiRequest({
  baseURL: API_BASE_URL,
  getHeaders: getServerCookieHeaders,
  nodeEnv: process.env.NODE_ENV,
});

function adminPath(path: string) {
  if (path === "/me" || path.startsWith("/me/")) return `/admin${path}`;
  if (path === "/payments/checkout") return "/admin/payments/checkout";
  return path;
}

export function serverApiRequest<T>(path: string, init?: RequestInit) {
  return request<T>(adminPath(path), init);
}
