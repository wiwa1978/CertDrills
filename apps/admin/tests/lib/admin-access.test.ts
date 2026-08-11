import { describe, expect, it } from "vitest";

import { ApiRequestError } from "@platform/frontend-shared";

import { checkAdminAccess } from "../../src/lib/admin-access";

describe("checkAdminAccess", () => {
  it("distinguishes required TOTP enrollment from allowlist denial", async () => {
    const result = await checkAdminAccess(async () => {
      throw new ApiRequestError({
        status: 403,
        message: "Admin two-factor authentication is required.",
        errorCode: "TWO_FACTOR_REQUIRED",
      });
    });

    expect(result).toEqual({ allowed: false, reason: "two-factor-required" });
  });

  it("keeps other authorization failures generic", async () => {
    const result = await checkAdminAccess(async () => {
      throw new ApiRequestError({ status: 403, message: "Forbidden", errorCode: "FORBIDDEN" });
    });

    expect(result).toEqual({ allowed: false, reason: "forbidden" });
  });

  it("allows a successful status request", async () => {
    await expect(checkAdminAccess(async () => ({ success: true }))).resolves.toEqual({ allowed: true });
  });
});
