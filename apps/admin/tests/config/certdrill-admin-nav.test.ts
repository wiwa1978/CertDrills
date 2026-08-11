import { describe, expect, it } from "vitest";
import { mergeProductMessages } from "@platform/module-contracts";

import { productAdminContributions } from "../../src/composition/product";
import { getBackendNavAdminItems } from "../../src/config/backend-navbar-admin";

describe("CertDrill admin navigation", () => {
  it("contains CertDrill and Questions admin links in order", () => {
    const items = getBackendNavAdminItems();
    const adminNavTitles = items.map((item) => item.title);

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "certdrill.nav.certifications", url: "/admin/certdrill" }),
        expect.objectContaining({ title: "certdrill.nav.questions", url: "/admin/questions" }),
      ]),
    );
    expect(adminNavTitles.indexOf("certdrill.nav.questions")).toBe(adminNavTitles.indexOf("certdrill.nav.certifications") + 1);
  });

  it("defines the Questions nav label in all admin locales", () => {
    expect(mergeProductMessages({}, productAdminContributions, "en")).toMatchObject({ certdrill: { nav: { questions: "Questions" } } });
    expect(mergeProductMessages({}, productAdminContributions, "fr")).toMatchObject({ certdrill: { nav: { questions: "Questions" } } });
    expect(mergeProductMessages({}, productAdminContributions, "nl")).toMatchObject({ certdrill: { nav: { questions: "Vragen" } } });
  });
});
