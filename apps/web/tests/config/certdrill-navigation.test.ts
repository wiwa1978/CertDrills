import { describe, expect, it } from "vitest";

import { BackendNavItems } from "../../src/config/backend-navbar-dashboard";

describe("CertDrill web navigation", () => {
  it("shows exams in authenticated navigation", () => {
    expect(BackendNavItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "dashboard.nav.exams", url: "/exams" }),
    ]));
  });
});
