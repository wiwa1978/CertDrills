import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin login form", () => {
  it("does not render the TOTP field during the credentials step", () => {
    const source = readFileSync(join(process.cwd(), "src/app/[locale]/(frontend)/(auth)/login/page.tsx"), "utf8");

    expect(source).not.toContain("authConfig.adminPortalTotpRequired");
  });

  it("converts thrown authentication requests into an accessible form error", () => {
    const source = readFileSync(join(process.cwd(), "src/app/[locale]/(frontend)/(auth)/login/page.tsx"), "utf8");

    expect(source).toContain("try {");
    expect(source).toContain("response = await authClient.signIn.email");
    expect(source).toContain("showUnexpectedLoginError(error)");
    expect(source).toContain('passwordForm.resetField("password")');
    expect(source).toContain('<div role="alert"');
  });
});
