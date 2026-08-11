
export type CreateWebAuthClientOptions = {
  baseURL: string;
  features?: {
    billing?: boolean;
    twoFactor?: boolean;
    passkeys?: boolean;
    magicLink?: boolean;
  };
  onError?: (ctx: { error: unknown; context: unknown }) => void;
};

export type MobileTokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  tokenType: "Bearer";
};

export type MobileTokenStorage = {
  getTokens: () => Promise<MobileTokenPair | null>;
  setTokens: (tokens: MobileTokenPair) => Promise<void>;
  clearTokens: () => Promise<void>;
};

export type MobileSecureStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

export type CreateMobileTokenStorageOptions = {
  store: MobileSecureStore;
  key?: string;
};

export type MobileFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type CreateMobileAuthClientOptions = {
  baseURL: string;
  storage: MobileTokenStorage;
  fetch?: MobileFetch;
};
