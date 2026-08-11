import { describe, expect, it, vi } from "vitest";

import { createMobileAuthClient, MobileAuthError } from "../src/mobile";
import { createSecureMobileTokenStorage } from "../src/mobile-storage";
import type { MobileTokenPair, MobileTokenStorage } from "../src/types";

const initialTokens: MobileTokenPair = {
  accessToken: "access-token-123456",
  refreshToken: "refresh-token-123456",
  expiresInSeconds: 900,
  tokenType: "Bearer",
};

function tokenResponse(tokens: MobileTokenPair) {
  return new Response(JSON.stringify({ success: true, data: tokens }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function memoryStorage(initial: MobileTokenPair | null = null) {
  let value = initial;
  const storage: MobileTokenStorage = {
    getTokens: vi.fn(async () => value),
    setTokens: vi.fn(async (tokens) => { value = tokens; }),
    clearTokens: vi.fn(async () => { value = null; }),
  };
  return { storage, current: () => value };
}

describe("mobile auth client", () => {
  it("validates and stores login tokens in the supplied secure adapter", async () => {
    const store = memoryStorage();
    const fetcher = vi.fn(async () => tokenResponse(initialTokens));
    const client = createMobileAuthClient({ baseURL: "https://api.example.test/", storage: store.storage, fetch: fetcher });

    await expect(client.login("user@example.test", "password-123")).resolves.toEqual(initialTokens);
    expect(store.current()).toEqual(initialTokens);
    expect(fetcher).toHaveBeenCalledWith("https://api.example.test/auth/mobile/token", expect.objectContaining({ method: "POST" }));
  });

  it("locks concurrent refreshes and persists the rotated pair once", async () => {
    const rotatedTokens = {
      ...initialTokens,
      accessToken: "rotated-access-123456",
      refreshToken: "rotated-refresh-123456",
    };
    const store = memoryStorage(initialTokens);
    const fetcher = vi.fn(async () => tokenResponse(rotatedTokens));
    const client = createMobileAuthClient({ baseURL: "https://api.example.test", storage: store.storage, fetch: fetcher });

    const [first, second] = await Promise.all([client.refresh(), client.refresh()]);

    expect(first).toEqual(rotatedTokens);
    expect(second).toEqual(rotatedTokens);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(store.storage.setTokens).toHaveBeenCalledTimes(1);
    expect(store.current()).toEqual(rotatedTokens);
  });

  it("clears local tokens before revoking the current refresh token", async () => {
    const store = memoryStorage(initialTokens);
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { revoked: true } }), { status: 200 }));
    const client = createMobileAuthClient({ baseURL: "https://api.example.test", storage: store.storage, fetch: fetcher });

    await client.logout();

    expect(store.current()).toBeNull();
    expect(fetcher).toHaveBeenCalledWith("https://api.example.test/auth/mobile/revoke", expect.objectContaining({
      body: JSON.stringify({ refreshToken: initialTokens.refreshToken }),
    }));
  });

  it("returns stable errors for invalid server responses", async () => {
    const store = memoryStorage();
    const client = createMobileAuthClient({
      baseURL: "https://api.example.test",
      storage: store.storage,
      fetch: vi.fn(async () => new Response("not-json", { status: 502 })),
    });

    await expect(client.login("user@example.test", "password-123")).rejects.toEqual(
      expect.objectContaining<Partial<MobileAuthError>>({ code: "INVALID_RESPONSE", status: 502 }),
    );
    expect(store.current()).toBeNull();
  });
});

describe("secure mobile token storage", () => {
  it("round-trips validated tokens through an Expo-compatible secure store", async () => {
    let stored: string | null = null;
    const secureStore = {
      getItemAsync: vi.fn(async () => stored),
      setItemAsync: vi.fn(async (_key: string, value: string) => { stored = value; }),
      deleteItemAsync: vi.fn(async () => { stored = null; }),
    };
    const storage = createSecureMobileTokenStorage({ store: secureStore });

    await storage.setTokens(initialTokens);
    await expect(storage.getTokens()).resolves.toEqual(initialTokens);
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      "platform.mobile-auth.tokens",
      JSON.stringify(initialTokens),
    );
    await storage.clearTokens();
    expect(stored).toBeNull();
  });

  it("deletes malformed secure-store data instead of returning it", async () => {
    const secureStore = {
      getItemAsync: vi.fn(async () => JSON.stringify({ accessToken: "truncated" })),
      setItemAsync: vi.fn(),
      deleteItemAsync: vi.fn(),
    };
    const storage = createSecureMobileTokenStorage({ store: secureStore, key: "auth" });

    await expect(storage.getTokens()).resolves.toBeNull();
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith("auth");
  });
});
