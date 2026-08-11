import { describe, expect, it } from "vitest";

import { BackendNavAdminItems } from "../../src/config/backend-navbar-admin";

describe("admin backend nav config", () => {
  it("keeps expected order and unique urls", () => {
    const urls = BackendNavAdminItems.map((item) => item.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toEqual([
      "/admin/overview",
      "/admin/system",
      "/admin/users",
      "/admin/billing",
      "/admin/webhooks",
      "/admin/operations",
      "/admin/notifications",
      "/admin/logs",
    ]);
  });
});
