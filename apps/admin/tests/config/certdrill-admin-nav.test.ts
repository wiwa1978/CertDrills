import { describe, expect, it } from "vitest";

import { BackendNavAdminItems } from "../../src/config/backend-navbar-admin";

describe("CertDrill admin navigation", () => {
  it("contains CertDrill admin link", () => {
    expect(BackendNavAdminItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "admin.nav.certdrill", url: "/admin/certdrill" }),
    ]));
  });
});
