import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as billingTabs from "@/components/layout/backend/admin/billing/admin-billing-tabs";
import { TransactionAdminBillingTabs } from "@/components/layout/backend/admin/billing/admin-billing-tabs";

const ordersSearch = "section=orders&tab=refunds&range=custom&startDate=2026-06-01&endDate=2026-06-30&status=failed&search=alice&grouping=week&currency=EUR&productKey=starterContent&page=4";
let currentSearchParams = new URLSearchParams(ordersSearch);

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/billing",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => currentSearchParams,
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children as never),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children, ...props }: Record<string, unknown>) => createElement("mock-tabs", props, children as never),
  TabsList: ({ children, ...props }: Record<string, unknown>) => createElement("mock-tabs-list", props, children as never),
  TabsTrigger: ({ children, ...props }: Record<string, unknown>) => createElement("button", props, children as never),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  currentSearchParams = new URLSearchParams(ordersSearch);
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation((message?: unknown, ...args: unknown[]) => {
    if (typeof message === "string" && message.startsWith("react-test-renderer is deprecated")) return;
    console.warn(message, ...args);
  });
});

function anchors(renderer: ReactTestRenderer) {
  return renderer.root.findAllByType("a");
}

describe("transaction admin billing navigation", () => {
  it("renders six semantic peer links with one current page and canonical hrefs", async () => {
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(TransactionAdminBillingTabs, {
        activeSection: "orders",
        children: createElement("h1", null, "Dashboard"),
      }));
    });

    const nav = renderer!.root.findByType("nav");
    expect(nav.props["aria-label"]).toBe("tabs.label");
    expect(String(nav.props.className)).toContain("overflow-x-auto");
    const navItems = nav.findAllByType("div")[0];
    expect(String(navItems.props.className)).toContain("w-full");
    expect(String(navItems.props.className)).toContain("md:grid");
    expect(String(navItems.props.className)).toContain("md:grid-cols-6");
    const links = anchors(renderer!);
    expect(links).toHaveLength(6);
    expect(links.map((link) => link.children.join(""))).toEqual([
      "tabs.overview", "tabs.orders", "tabs.refunds", "tabs.products", "nav.discounts", "nav.vouchers",
    ]);
    expect(links.map((link) => link.props.href)).toEqual([
      "/admin/billing",
      "/admin/billing?section=orders&range=custom&startDate=2026-06-01&endDate=2026-06-30&status=failed&search=alice&page=1",
      "/admin/billing?section=refunds",
      "/admin/billing?section=products",
      "/admin/billing?section=discounts",
      "/admin/billing?section=vouchers",
    ]);
    expect(links.filter((link) => link.props["aria-current"] === "page")).toHaveLength(1);
    expect(links[1].props["aria-current"]).toBe("page");
    expect(links.every((link) => String(link.props.className).includes("min-w-32"))).toBe(true);
    expect(links.every((link) => String(link.props.className).includes("md:min-w-0"))).toBe(true);
    expect(links.every((link) => String(link.props.className).includes("md:w-full"))).toBe(true);
    expect(renderer!.root.findAll((node) => node.props.role === "tab" || node.props["aria-controls"] !== undefined)).toHaveLength(0);
  });

  it("detects only active links outside the horizontal viewport", () => {
    const shouldScroll = (billingTabs as typeof billingTabs & {
      shouldScrollActiveNavItem: (container: { left: number; right: number }, item: { left: number; right: number }) => boolean;
    }).shouldScrollActiveNavItem;

    expect(shouldScroll).toBeTypeOf("function");
    expect(shouldScroll({ left: 10, right: 100 }, { left: 20, right: 90 })).toBe(false);
    expect(shouldScroll({ left: 10, right: 100 }, { left: 5, right: 40 })).toBe(true);
    expect(shouldScroll({ left: 10, right: 100 }, { left: 80, right: 110 })).toBe(true);
  });

  it("scrolls an offscreen active link into view and tolerates a missing method", async () => {
    const scrollIntoView = vi.fn();
    await act(async () => {
      create(createElement(TransactionAdminBillingTabs, { activeSection: "orders", children: null }), {
        createNodeMock: (element) => {
          if (element.type === "nav") return { getBoundingClientRect: () => ({ left: 0, right: 100 }) };
          const props = element.props as Record<string, unknown>;
          if (element.type === "a" && props["aria-current"] === "page") {
            return { getBoundingClientRect: () => ({ left: 110, right: 180 }), scrollIntoView };
          }
          return { getBoundingClientRect: () => ({ left: 0, right: 0 }) };
        },
      });
    });
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "center" });

    await expect(act(async () => {
      create(createElement(TransactionAdminBillingTabs, { activeSection: "orders", children: null }), {
        createNodeMock: (element) => element.type === "nav"
          ? { getBoundingClientRect: () => ({ left: 0, right: 100 }) }
          : { getBoundingClientRect: () => ({ left: 110, right: 180 }) },
      });
    })).resolves.toBeUndefined();
  });

  it("does not scroll an active link already within the viewport", async () => {
    const scrollIntoView = vi.fn();
    await act(async () => {
      create(createElement(TransactionAdminBillingTabs, { activeSection: "orders", children: null }), {
        createNodeMock: (element) => element.type === "nav"
          ? { getBoundingClientRect: () => ({ left: 0, right: 100 }) }
          : { getBoundingClientRect: () => ({ left: 10, right: 90 }), scrollIntoView },
      });
    });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("adds only a screen-reader page heading to discounts and vouchers", async () => {
    for (const section of ["discounts", "vouchers"] as const) {
      let renderer: ReactTestRenderer;
      await act(async () => {
        renderer = create(createElement(TransactionAdminBillingTabs, {
          activeSection: section,
          children: createElement("div", null, "Section UI"),
        }));
      });
      const headings = renderer!.root.findAllByType("h1");
      expect(headings).toHaveLength(1);
      expect(headings[0].children.join("")).toBe(`${section}.title`);
      expect(headings[0].props.className).toBe("sr-only");
      expect(renderer!.root.findAllByType("p")).toHaveLength(0);
      expect(renderer!.root.findAllByType("div").some((node) => node.children.includes("Section UI"))).toBe(true);
    }

    let dashboard: ReactTestRenderer;
    await act(async () => {
      dashboard = create(createElement(TransactionAdminBillingTabs, {
        activeSection: "overview",
        children: createElement("h1", null, "Dashboard"),
      }));
    });
    expect(dashboard!.root.findAllByType("h1")).toHaveLength(1);
    expect(dashboard!.root.findByType("h1").children.join("")).toBe("Dashboard");
  });
});
