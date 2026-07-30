import type { AuthRole } from "@platform/auth-shared";

export type AuthUser = {
  id: string;
  role?: AuthRole | null;
  email?: string | null;
  twoFactorEnabled?: boolean | null;
};

export type AppEnv = {
  Variables: {
    requestId?: string;
    authUser?: AuthUser;
    authSession?: unknown;
    clientLogRemaining?: number;
  };
};
