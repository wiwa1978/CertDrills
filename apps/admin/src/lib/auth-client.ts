"use client";

import { nextCookies } from "better-auth/next-js";
import { toast } from "sonner";

import { createWebAdminAuthClient } from "@platform/auth-client/web-admin";

import { env } from "@/env";
import { authConfig } from "@/config/auth";
import { clientLogger } from "./client-logger";

function normalizeBaseUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

const authBaseURL = `${normalizeBaseUrl(env.NEXT_PUBLIC_API_URL || env.NEXT_PUBLIC_APP_URL)}/auth`;

export const authClient = createWebAdminAuthClient({
  baseURL: authBaseURL,
  features: {
    billing: true,
    twoFactor: authConfig.enableTwoFactor,
    passkeys: authConfig.enablePasskeys,
    magicLink: authConfig.enableMagicLink,
  },
  plugins: [nextCookies()],
  onError({ error, context }) {
    clientLogger.error("[auth-client] Request failed", {
      baseURL: authBaseURL,
      error,
      context,
    });

    if ((error as { status?: number } | undefined)?.status === 429) {
      toast.error("Too many requests. Please try again later.");
    }
  },
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
  updateUser,
  changePassword,
  changeEmail,
  requestPasswordReset,
  resetPassword,
  listSessions,
  revokeSession,
  revokeSessions,
  deleteUser,
  linkSocial,
  unlinkAccount,
  listAccounts,
  twoFactor,
  passkey,
  magicLink,
  admin,
} = authClient;
