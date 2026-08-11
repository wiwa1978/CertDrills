import { errorCode } from "@platform/contracts";

/**
 * Post-sign-in gate state for a user attempting to obtain mobile JWTs.
 * Source it from the database AFTER a successful credential check
 * (password, social IdP token, magic link, etc.) so the same rules apply
 * to every mobile authentication path.
 */
export type MobileSignInGateInput = {
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  banned: boolean;
  banExpires?: Date | null;
  /** Optional clock override for testing. */
  now?: Date;
};

export type MobileSignInGateResult =
  | { ok: true }
  | {
      ok: false;
      status: 401 | 403;
      errorCode:
        | typeof errorCode.emailNotVerified
        | typeof errorCode.twoFactorRequired
        | typeof errorCode.accountBanned;
      error: string;
    };

/**
 * Pure function — apply the same gates that the cookie-based sign-in path
 * applies (email verification, 2FA step-up, ban enforcement) to ANY mobile
 * sign-in flow: password, social (Google/GitHub/Apple) via better-auth,
 * magic link, etc.
 *
 * Mobile clients receive a JSON envelope with a stable `errorCode` so they
 * can drive the next UI step (verify-email screen, 2FA challenge, etc.)
 * without parsing English strings.
 */
export function enforceMobileSignInGate(
  input: MobileSignInGateInput,
): MobileSignInGateResult {
  const now = input.now ?? new Date();

  if (input.banned) {
    const stillBanned =
      !input.banExpires || input.banExpires.getTime() > now.getTime();

    if (stillBanned) {
      return {
        ok: false,
        status: 403,
        errorCode: errorCode.accountBanned,
        error: "Account is banned",
      };
    }
  }

  if (!input.emailVerified) {
    return {
      ok: false,
      status: 403,
      errorCode: errorCode.emailNotVerified,
      error: "Email address is not verified",
    };
  }

  if (input.twoFactorEnabled) {
    // Mobile 2FA challenge flow is not yet implemented. Until it is, refuse
    // to mint tokens for accounts with 2FA enabled rather than silently
    // bypassing the second factor.
    return {
      ok: false,
      status: 403,
      errorCode: errorCode.twoFactorRequired,
      error: "Two-factor authentication is required",
    };
  }

  return { ok: true };
}
