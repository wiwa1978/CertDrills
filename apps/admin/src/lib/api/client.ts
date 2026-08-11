import { env } from "@/env";
import { createApiRequest, normalizeBaseUrl } from "@platform/frontend-shared";

const API_BASE_URL = normalizeBaseUrl(env.NEXT_PUBLIC_API_URL || env.NEXT_PUBLIC_APP_URL);

const request = createApiRequest({
  baseURL: API_BASE_URL,
  nodeEnv: process.env.NODE_ENV,
});

function adminPath(path: string) {
  if (path === "/me" || path.startsWith("/me/")) return `/admin${path}`;
  if (path === "/payments/checkout") return "/admin/payments/checkout";
  return path;
}

export function apiRequest<T>(path: string, init?: RequestInit) {
  return request<T>(adminPath(path), init);
}
