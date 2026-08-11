import { describe, expect, it } from "vitest";

import { FrontendAuthItems, FrontendNavItems } from "../../src/config/frontend-navbar";
import { BackendNavItems, getBackendNavItems, getUserDropdownNavItems } from "../../src/config/backend-navbar-dashboard";

describe("web navigation config", () => {
  it("keeps unique frontend navigation urls", () => {
    const urls = FrontendNavItems.map((item) => item.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("contains expected auth entries", () => {
    expect(FrontendAuthItems.login.url).toBe("/login");
    expect(FrontendAuthItems.signup.url).toBe("/signup");
  });

  it("contains expected dashboard sidebar entries", () => {
    expect(BackendNavItems).toHaveLength(2);
    expect(BackendNavItems).toEqual([
      expect.objectContaining({
        title: "dashboard.nav.overview",
        url: "/dashboard",
      }),
      expect.objectContaining({
        title: "dashboard.nav.billing",
        url: "/billing",
      }),
    ]);
  });

  it("hides only billing navigation when no billing surfaces are enabled", () => {
    const items = getBackendNavItems({ billing: { creditSurfacesEnabled: false, subscriptionSurfacesEnabled: false } });
    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: "/dashboard" }),
      expect.objectContaining({ url: "/exams" }),
      expect.objectContaining({ url: "/profile/attempts" }),
    ]));
    expect(items).not.toEqual(expect.arrayContaining([expect.objectContaining({ url: "/billing" })]));
  });

  it("shows billing navigation when any billing surface is enabled", () => {
    expect(getBackendNavItems({ billing: { creditSurfacesEnabled: true, subscriptionSurfacesEnabled: false } })).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: "/billing" })]),
    );
    expect(getBackendNavItems({ billing: { creditSurfacesEnabled: false, subscriptionSurfacesEnabled: true } })).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: "/billing" })]),
    );
    expect(getBackendNavItems({ billing: { creditSurfacesEnabled: false, subscriptionSurfacesEnabled: false, transactionSurfacesEnabled: true } })).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: "/billing" })]),
    );
  });

  it("uses the same billing gate for user dropdown navigation", () => {
    expect(getUserDropdownNavItems({ billing: { creditSurfacesEnabled: false, subscriptionSurfacesEnabled: false } })).toEqual([
      expect.objectContaining({ url: "/settings" }),
    ]);

    expect(getUserDropdownNavItems({ billing: { creditSurfacesEnabled: true, subscriptionSurfacesEnabled: false } })).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: "/billing" })]),
    );
    expect(getUserDropdownNavItems({ billing: { creditSurfacesEnabled: false, subscriptionSurfacesEnabled: false, transactionSurfacesEnabled: true } })).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: "/billing" })]),
    );
  });
});
