import {
  mobileRevokeResponseSchema,
  mobileTokenErrorSchema,
  mobileTokenResultSchema,
} from "@platform/contracts";

import type {
  CreateMobileAuthClientOptions,
  MobileFetch,
  MobileTokenPair,
} from "./types";

export class MobileAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MobileAuthError";
  }
}

function endpoint(baseURL: string, path: string) {
  return `${baseURL.replace(/\/$/, "")}${path}`;
}

async function readJson(response: Response) {
  return response.json().catch(() => null);
}

function responseError(payload: unknown, status: number) {
  const parsed = mobileTokenErrorSchema.safeParse(payload);
  if (parsed.success) {
    return new MobileAuthError(parsed.data.error.code, parsed.data.error.message, status);
  }
  return new MobileAuthError("INVALID_RESPONSE", "Invalid mobile authentication response", status);
}

async function requestTokens(
  fetcher: MobileFetch,
  url: string,
  body: Record<string, unknown>,
): Promise<MobileTokenPair> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new MobileAuthError("NETWORK_ERROR", "Mobile authentication request failed", 0);
  }

  const payload = await readJson(response);
  const parsed = mobileTokenResultSchema.safeParse(payload);
  if (!parsed.success) throw responseError(payload, response.status);
  if (!parsed.data.success) {
    throw new MobileAuthError(parsed.data.error.code, parsed.data.error.message, response.status);
  }
  return parsed.data.data;
}

export function createMobileAuthClient(options: CreateMobileAuthClientOptions) {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  let refreshPromise: Promise<MobileTokenPair> | null = null;

  async function login(email: string, password: string) {
    if (refreshPromise) await refreshPromise.catch(() => undefined);
    const tokens = await requestTokens(fetcher, endpoint(options.baseURL, "/auth/mobile/token"), {
      email,
      password,
    });
    await options.storage.setTokens(tokens);
    return tokens;
  }

  async function performRefresh() {
    const current = await options.storage.getTokens();
    if (!current) throw new MobileAuthError("NOT_AUTHENTICATED", "No mobile refresh token is available", 401);

    const tokens = await requestTokens(fetcher, endpoint(options.baseURL, "/auth/mobile/refresh"), {
      refreshToken: current.refreshToken,
    });
    await options.storage.setTokens(tokens);
    return tokens;
  }

  async function refresh() {
    if (refreshPromise) return refreshPromise;
    const pending = performRefresh();
    refreshPromise = pending;
    try {
      return await pending;
    } finally {
      if (refreshPromise === pending) refreshPromise = null;
    }
  }

  async function logout() {
    if (refreshPromise) await refreshPromise.catch(() => undefined);
    const current = await options.storage.getTokens();
    await options.storage.clearTokens();
    if (!current) return;

    let response: Response;
    try {
      response = await fetcher(endpoint(options.baseURL, "/auth/mobile/revoke"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
    } catch {
      throw new MobileAuthError("NETWORK_ERROR", "Mobile token revocation failed", 0);
    }

    const payload = await readJson(response);
    if (!mobileRevokeResponseSchema.safeParse(payload).success) {
      throw responseError(payload, response.status);
    }
  }

  async function getAccessToken() {
    return (await options.storage.getTokens())?.accessToken ?? null;
  }

  return { login, refresh, logout, getAccessToken };
}
