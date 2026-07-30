import type { BetterAuthOptions } from "better-auth";
import type { MiddlewareHandler } from "hono";

import type { AuthRole } from "@platform/auth-shared";
import type { ErrorCode } from "@platform/contracts/wire";

export type AuthGuardContext = {
  auth: {
    api: {
      getSession: (args: { headers: Headers }) => Promise<unknown>;
    };
  };
};

export type AuthUserRecord = {
  id: string;
  role?: string | null;
  email?: string | null;
  /**
   * Required for the mobile sign-in gate. Cookie-only deployments may stub
   * these to `true`/`false`/`false` respectively, but mobile flows MUST
   * surface the real values so {@link enforceMobileSignInGate} can apply
   * email-verification, 2FA, and ban checks.
   */
  emailVerified?: boolean;
  twoFactorEnabled?: boolean | null;
  banned?: boolean | null;
  banExpires?: Date | null;
};

export type AuthModuleOptions = {
  betterAuthOptions: BetterAuthOptions;
  users: {
    findById: (userId: string) => Promise<AuthUserRecord | null>;
  };
  admin: {
    allowlist: Set<string>;
  };
  jwt: {
    secret: string;
    issuer: string;
    audience: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlSeconds: number;
  };
  refreshTokens: {
    create: (args: { tokenHash: string; userId: string; expiresAt: Date }) => Promise<void>;
    findActiveByHash: (tokenHash: string) => Promise<{ userId: string } | null>;
    rotate: (args: {
      currentTokenHash: string;
      nextTokenHash: string;
      userId: string;
      nextExpiresAt: Date;
    }) => Promise<boolean>;
    revokeByHash: (tokenHash: string) => Promise<void>;
    cleanupExpired: () => Promise<void>;
  };
};

export type AuthenticatedUser = {
  id: string;
  role?: AuthRole | null;
  email?: string | null;
  twoFactorEnabled?: boolean | null;
};

export type AuthContextVariables = {
  authUser?: AuthenticatedUser;
  authSession?: unknown;
};

export type AuthFailure = {
  ok: false;
  status: 401 | 403;
  error: string;
  errorCode?: ErrorCode;
};

export type AuthMiddleware = MiddlewareHandler<{
  Variables: AuthContextVariables;
}>;
