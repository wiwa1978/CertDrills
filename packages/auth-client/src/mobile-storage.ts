import { mobileTokenDataSchema } from "@platform/contracts";

import type { CreateMobileTokenStorageOptions, MobileTokenStorage } from "./types";

const DEFAULT_STORAGE_KEY = "platform.mobile-auth.tokens";

export function createSecureMobileTokenStorage(
  options: CreateMobileTokenStorageOptions,
): MobileTokenStorage {
  const key = options.key ?? DEFAULT_STORAGE_KEY;

  return {
    async getTokens() {
      const value = await options.store.getItemAsync(key);
      if (!value) return null;
      try {
        const parsed = mobileTokenDataSchema.safeParse(JSON.parse(value));
        if (parsed.success) return parsed.data;
      } catch {
        // Corrupt secure-store entries are removed below.
      }
      await options.store.deleteItemAsync(key);
      return null;
    },
    async setTokens(tokens) {
      const parsed = mobileTokenDataSchema.parse(tokens);
      await options.store.setItemAsync(key, JSON.stringify(parsed));
    },
    async clearTokens() {
      await options.store.deleteItemAsync(key);
    },
  };
}
