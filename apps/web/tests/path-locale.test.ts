import { describe, expect, it } from "vitest";

import { getInternalNavigationPath, getPathLocale } from "../src/i18n/path-locale";

describe("getPathLocale", () => {
  it("parses supported locale from first path segment", () => {
    expect(getPathLocale("/nl/dashboard")).toEqual({
      activeLocale: "nl",
      pathWithoutLocale: "/dashboard",
    });
    expect(getPathLocale("/fr/billing/history")).toEqual({
      activeLocale: "fr",
      pathWithoutLocale: "/billing/history",
    });
  });

  it("falls back to default locale when path has no supported locale", () => {
    expect(getPathLocale("/dashboard")).toEqual({
      activeLocale: "en",
      pathWithoutLocale: "/dashboard",
    });
  });
});

describe("getInternalNavigationPath", () => {
  it("removes the locale prefix before using next-intl navigation", () => {
    expect(getInternalNavigationPath("/nl/dashboard")).toBe("/dashboard");
    expect(getInternalNavigationPath("/fr/billing?success=true")).toBe("/billing?success=true");
  });

  it("keeps unlocalized paths unchanged", () => {
    expect(getInternalNavigationPath("/dashboard")).toBe("/dashboard");
  });
});
