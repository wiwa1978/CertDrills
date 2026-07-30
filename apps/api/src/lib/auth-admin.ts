import { errorCode, errorResultSchema } from "@platform/contracts";

import { errorPayload } from "./http";

type AdminAuthApi = {
  setRole: (args: { body: { userId: string; role: string }; headers: Headers; asResponse?: boolean }) => Promise<unknown>;
  banUser: (args: {
    body: { userId: string; banReason?: string; banExpiresIn?: number };
    headers: Headers;
    asResponse?: boolean;
  }) => Promise<unknown>;
  unbanUser: (args: { body: { userId: string }; headers: Headers; asResponse?: boolean }) => Promise<unknown>;
  impersonateUser: (args: { body: { userId: string }; headers: Headers; asResponse?: boolean }) => Promise<Response | unknown>;
  revokeUserSessions: (args: { body: { userId: string }; headers: Headers; asResponse?: boolean }) => Promise<unknown>;
  setUserPassword: (args: {
    body: { userId: string; newPassword: string };
    headers: Headers;
    asResponse?: boolean;
  }) => Promise<unknown>;
  stopImpersonating: (args: { headers: Headers; asResponse?: boolean }) => Promise<Response | unknown>;
  generateOpenAPISchema: (args: { headers?: Headers; asResponse?: boolean }) => Promise<unknown>;
};

export function getAdminAuthApi(api: unknown) {
  return api as AdminAuthApi;
}

export function resolveAdminAuthApi(authModule: { auth?: { api?: unknown } }) {
  const api = authModule.auth?.api;
  return api ? getAdminAuthApi(api) : null;
}

export function copySetCookieHeader(source: Response, target: Response) {
  const getSetCookie = (source.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies = typeof getSetCookie === "function" ? getSetCookie.call(source.headers) : [];

  if (setCookies.length > 0) {
    for (const value of setCookies) {
      target.headers.append("set-cookie", value);
    }

    return;
  }

  const setCookie = source.headers.get("set-cookie");
  if (setCookie) {
    target.headers.set("set-cookie", setCookie);
  }
}

export async function createJsonResponseFromAuthResponse(response: Response, fallbackError: string) {
  const rawPayload = await response.json().catch(() => errorPayload(errorCode.badRequest, fallbackError));
  const payload = errorResultSchema.safeParse(rawPayload).success
    ? rawPayload
    : response.ok
      ? { success: true, data: null }
      : errorPayload(errorCode.badRequest, fallbackError);
  const result = new Response(JSON.stringify(payload), {
    status: response.status,
    headers: {
      "content-type": "application/json",
    },
  });

  copySetCookieHeader(response, result);
  return result;
}
