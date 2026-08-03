import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { BackendNavAdminItems } from "../../src/config/backend-navbar-admin";

function readMessages(locale: "en" | "fr" | "nl") {
  return JSON.parse(readFileSync(new URL(`../../src/messages/${locale}.json`, import.meta.url), "utf8"));
}

describe("CertDrill admin navigation", () => {
  it("contains CertDrill and Questions admin links in order", () => {
    const adminNavTitles = BackendNavAdminItems.map((item) => item.title);

    expect(BackendNavAdminItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "admin.nav.certdrill", url: "/admin/certdrill" }),
        expect.objectContaining({ title: "admin.nav.questions", url: "/admin/questions" }),
      ]),
    );
    expect(adminNavTitles.indexOf("admin.nav.questions")).toBe(adminNavTitles.indexOf("admin.nav.certdrill") + 1);
  });

  it("defines the Questions nav label in all admin locales", () => {
    expect(readMessages("en").admin.nav.questions).toBe("Questions");
    expect(readMessages("fr").admin.nav.questions).toBe("Questions");
    expect(readMessages("nl").admin.nav.questions).toBe("Vragen");
  });
});
