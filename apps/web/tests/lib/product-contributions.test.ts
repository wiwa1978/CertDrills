import { describe, expect, it, vi } from "vitest";

import {
  mergeProductMessages,
  resolveProductNavigation,
  resolveProductRoutes,
  type PlatformWebContribution,
} from "@platform/module-contracts";

const sample: PlatformWebContribution = {
  id: "sample-product",
  navigation: [
    { id: "sample-home", href: "/extensions/sample", labelKey: "sample.nav", iconKey: "package", order: 20 },
    { id: "sample-admin", href: "/admin/extensions/sample", labelKey: "sample.admin", requiredCapability: "sample.admin", order: 10 },
  ],
  routes: [
    { id: "sample-page", path: "/extensions/sample", render: vi.fn(() => "sample") },
    { id: "sample-admin-page", path: "/admin/extensions/sample", requiredCapability: "sample.admin", render: vi.fn(() => "admin") },
  ],
  messages: {
    en: { sample: { nav: "Sample", nested: { title: "Product" } } },
  },
};

describe("frontend product contributions", () => {
  it("supports a zero-product platform", () => {
    expect(resolveProductNavigation([])).toEqual([]);
    expect(resolveProductRoutes([])).toEqual([]);
    expect(mergeProductMessages({ platform: { title: "Platform" } }, [], "en"))
      .toEqual({ platform: { title: "Platform" } });
  });

  it("composes capability-filtered routes, navigation, icons, and messages", () => {
    expect(resolveProductNavigation([sample], ["sample.admin"]).map(({ id, iconKey }) => ({ id, iconKey })))
      .toEqual([
        { id: "sample-admin", iconKey: undefined },
        { id: "sample-home", iconKey: "package" },
      ]);
    expect(resolveProductRoutes([sample]).map((route) => route.id)).toEqual(["sample-page"]);
    expect(resolveProductRoutes([sample], ["sample.admin"]).map((route) => route.id))
      .toEqual(["sample-page", "sample-admin-page"]);
    expect(mergeProductMessages({ sample: { base: true } }, [sample], "en"))
      .toEqual({ sample: { base: true, nav: "Sample", nested: { title: "Product" } } });
  });

  it("rejects duplicate contributed paths", () => {
    expect(() => resolveProductRoutes([sample, { ...sample, id: "duplicate" }]))
      .toThrow("Duplicate product route id: sample-page");
  });
});
