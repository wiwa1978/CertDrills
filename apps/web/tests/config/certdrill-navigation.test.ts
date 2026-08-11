import { describe, expect, it } from "vitest";

import { getBackendNavItems } from "../../src/config/backend-navbar-dashboard";

describe("CertDrill web navigation", () => {
  it("shows exams in authenticated navigation", () => {
    expect(getBackendNavItems(null)).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "certdrill.nav.exams", url: "/exams" }),
    ]));
  });
});
