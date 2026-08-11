import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin login form", () => {
  it("does not render the TOTP field during the credentials step", () => {
    const source = readFileSync(join(process.cwd(), "src/app/[locale]/(frontend)/(auth)/login/page.tsx"), "utf8");

    expect(source).not.toContain("authConfig.adminPortalTotpRequired");
  });

  it("does not read or render forbidden-admin URL diagnostics", () => {
    const source = readFileSync(join(process.cwd(), "src/app/[locale]/(frontend)/(auth)/login/page.tsx"), "utf8");

    expect(source).not.toContain('searchParams.get("reason")');
    expect(source).not.toContain("forbidden-admin");
  });
});
