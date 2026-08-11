import { describe, expect, it } from "vitest";

import { getPathLocale } from "../src/i18n/path-locale";

describe("getPathLocale", () => {
  it("parses supported locale from first path segment", () => {
    expect(getPathLocale("/nl/admin/overview")).toEqual({
      activeLocale: "nl",
      pathWithoutLocale: "/admin/overview",
    });
    expect(getPathLocale("/fr/billing")).toEqual({
      activeLocale: "fr",
      pathWithoutLocale: "/billing",
    });
  });

  it("falls back to default locale when path has no supported locale", () => {
    expect(getPathLocale("/admin/overview")).toEqual({
      activeLocale: "en",
      pathWithoutLocale: "/admin/overview",
    });
  });
});
