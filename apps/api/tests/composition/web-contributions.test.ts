import { describe, expect, it } from "vitest";

import {
  mergeProductMessages,
  resolveProductNavigation,
  type PlatformWebContribution,
} from "@platform/module-contracts";

const contribution: PlatformWebContribution = {
  id: "catalog",
  navigation: [
    { id: "catalog-home", href: "/catalog", labelKey: "catalog.nav.home", order: 20 },
    {
      id: "catalog-export",
      href: "/catalog/export",
      labelKey: "catalog.nav.export",
      requiredCapability: "catalog.export",
      order: 30,
    },
  ],
  messages: {
    en: { catalog: { nav: { home: "Catalog", export: "Export" } } },
  },
};

describe("frontend product contributions", () => {
  it("deeply merges product translations without discarding platform messages", () => {
    expect(mergeProductMessages(
      { dashboard: { title: "Dashboard" }, catalog: { title: "Products" } },
      [contribution],
      "en",
    )).toEqual({
      dashboard: { title: "Dashboard" },
      catalog: {
        title: "Products",
        nav: { home: "Catalog", export: "Export" },
      },
    });
  });

  it("filters capability-gated navigation and preserves declared order", () => {
    expect(resolveProductNavigation([contribution]).map((item) => item.id)).toEqual(["catalog-home"]);
    expect(resolveProductNavigation([contribution], ["catalog.export"]).map((item) => item.id)).toEqual([
      "catalog-home",
      "catalog-export",
    ]);
  });

  it("rejects duplicate navigation destinations", () => {
    expect(() => resolveProductNavigation([
      contribution,
      {
        id: "reports",
        navigation: [{ id: "reports-home", href: "/catalog", labelKey: "reports.nav.home" }],
      },
    ])).toThrow("Duplicate navigation contribution href: /catalog");
  });
});
