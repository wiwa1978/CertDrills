import { describe, expect, it } from "vitest";

import { getPathSegments, stripLocaleFromPath } from "../../src/lib/utils";

describe("admin lib/utils", () => {
  it("strips locale from start of path", () => {
    expect(stripLocaleFromPath("/nl/admin/users")).toBe("/admin/users");
    expect(stripLocaleFromPath("/dashboard")).toBe("/dashboard");
  });

  it("removes admin segment from breadcrumbs", () => {
    expect(getPathSegments("/nl/admin/users")).toEqual(["users"]);
    expect(getPathSegments("/en/admin/billing/transactions")).toEqual(["billing", "transactions"]);
  });
});
