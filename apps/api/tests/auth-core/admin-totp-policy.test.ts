import { describe, expect, it } from "vitest";

import { authConfig } from "@platform/auth-shared";

describe("admin TOTP policy", () => {
  it("does not require a TOTP code during admin login", () => {
    expect(authConfig.adminPortalTotpRequired).toBe(false);
  });
});
