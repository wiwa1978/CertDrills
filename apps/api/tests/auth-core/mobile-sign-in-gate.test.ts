import { describe, expect, it } from "vitest";

import { enforceMobileSignInGate } from "@platform/auth-core";

describe("enforceMobileSignInGate", () => {
  const happy = {
    emailVerified: true,
    twoFactorEnabled: false,
    banned: false,
    banExpires: null,
  } as const;

  it("admits a verified, un-2FA, un-banned user", () => {
    expect(enforceMobileSignInGate(happy)).toEqual({ ok: true });
  });

  it("rejects an unverified email with EMAIL_NOT_VERIFIED / 403", () => {
    const result = enforceMobileSignInGate({ ...happy, emailVerified: false });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("EMAIL_NOT_VERIFIED");
    expect(result.status).toBe(403);
  });

  it("rejects a 2FA-enabled account with TWO_FACTOR_REQUIRED / 403", () => {
    const result = enforceMobileSignInGate({ ...happy, twoFactorEnabled: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("TWO_FACTOR_REQUIRED");
    expect(result.status).toBe(403);
  });

  it("rejects a banned account with no expiry as ACCOUNT_BANNED / 403", () => {
    const result = enforceMobileSignInGate({
      ...happy,
      banned: true,
      banExpires: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("ACCOUNT_BANNED");
  });

  it("rejects a banned account whose expiry is still in the future", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const result = enforceMobileSignInGate({
      ...happy,
      banned: true,
      banExpires: new Date("2026-02-01T00:00:00Z"),
      now,
    });
    expect(result.ok).toBe(false);
  });

  it("admits a banned-but-expired account (ban lifted)", () => {
    const now = new Date("2026-03-01T00:00:00Z");
    const result = enforceMobileSignInGate({
      ...happy,
      banned: true,
      banExpires: new Date("2026-02-01T00:00:00Z"),
      now,
    });
    expect(result.ok).toBe(true);
  });

  it("ban precedes email-verification check", () => {
    // A banned, unverified account should report banned (the more restrictive
    // state) so the client surfaces the right UX path.
    const result = enforceMobileSignInGate({
      emailVerified: false,
      twoFactorEnabled: false,
      banned: true,
      banExpires: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("ACCOUNT_BANNED");
  });
});
