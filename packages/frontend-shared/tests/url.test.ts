import { describe, expect, it } from "vitest";

import { normalizeBaseUrl, resolveInternalRedirect } from "../src/url";

describe("frontend URL utilities", () => {
  it("normalizes a trailing base URL slash", () => {
    expect(normalizeBaseUrl("https://app.example/")).toBe("https://app.example");
  });

  it("keeps internal paths with query strings and fragments", () => {
    expect(resolveInternalRedirect("/nl/billing?success=true#orders", "/dashboard"))
      .toBe("/nl/billing?success=true#orders");
  });

  it.each([
    "//evil.example/path",
    "/\\evil.example/path",
    "https://evil.example/path",
    "javascript:alert(1)",
    "dashboard",
    "/path\nset-cookie: value",
  ])("rejects unsafe redirect %s", (value) => {
    expect(resolveInternalRedirect(value, "/dashboard")).toBe("/dashboard");
  });

  it("rejects encoded backslash redirects after URL normalization", () => {
    expect(resolveInternalRedirect("/%5C%5Cevil.example/path", "/dashboard")).toBe("/dashboard");
  });
});
