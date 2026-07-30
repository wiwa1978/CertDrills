import { describe, expect, it } from "vitest";

import { getPasswordSignInRequest, getWebLoginAccessDecision } from "../../src/lib/login-submit";

describe("getPasswordSignInRequest", () => {
  it("does not include callbackURL so Better Auth cannot auto-redirect", () => {
    const request = getPasswordSignInRequest(
      { email: "user@example.com", password: "correct-password", rememberMe: true },
      true,
    );

    expect(request).toEqual({
      email: "user@example.com",
      password: "correct-password",
      rememberMe: true,
    });
    expect(request).not.toHaveProperty("callbackURL");
  });

  it("omits rememberMe when the feature is disabled", () => {
    expect(
      getPasswordSignInRequest(
        { email: "user@example.com", password: "correct-password", rememberMe: true },
        false,
      ),
    ).toEqual({
      email: "user@example.com",
      password: "correct-password",
    });
  });
});

describe("getWebLoginAccessDecision", () => {
  it("allows normal user accounts", () => {
    expect(getWebLoginAccessDecision({ role: "user" })).toEqual({ allowed: true });
  });

  it("rejects admin accounts on the web app", () => {
    expect(getWebLoginAccessDecision({ role: "admin" })).toEqual({
      allowed: false,
      errorCode: "WEB_LOGIN_FORBIDDEN",
    });
  });
});
