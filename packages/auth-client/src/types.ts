import type { BetterAuthClientPlugin } from "better-auth";

export type CreateWebAuthClientOptions = {
  baseURL: string;
  plugins?: BetterAuthClientPlugin[];
  features?: {
    billing?: boolean;
    twoFactor?: boolean;
    passkeys?: boolean;
    magicLink?: boolean;
  };
  onError?: (ctx: { error: unknown; context: unknown }) => void;
};

export type CreateMobileAuthClientOptions = {
  baseURL: string;
  storage?: {
    get: (key: string) => Promise<string | null> | string | null;
    set: (key: string, value: string) => Promise<void> | void;
    del: (key: string) => Promise<void> | void;
  };
};
