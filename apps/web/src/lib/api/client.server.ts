import "server-only";

import { cookies } from "next/headers";

import { env } from "@/env";
import { ApiRequestError, createApiRequest, normalizeBaseUrl } from "@platform/frontend-shared";

const API_BASE_URL = normalizeBaseUrl(env.NEXT_PUBLIC_API_URL || env.NEXT_PUBLIC_APP_URL);

async function getServerCookieHeaders() {
  const cookieHeader = (await cookies()).toString();
  return cookieHeader.length > 0 ? { cookie: cookieHeader } : undefined;
}

export { ApiRequestError };

export const serverApiRequest = createApiRequest({
  baseURL: API_BASE_URL,
  getHeaders: getServerCookieHeaders,
  nodeEnv: process.env.NODE_ENV,
});
