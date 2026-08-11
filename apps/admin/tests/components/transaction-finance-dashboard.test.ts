import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminTransactionFinanceDashboard } from "@platform/contracts";
import * as transactionHelpers from "@/components/layout/backend/admin/billing/transaction-finance-dashboard-helpers";

import {
  buildAttemptsAccessibleRows,
  buildTransactionDashboardHref,
  buildRevenueChartData,
  buildRevenueAccessibleRows,
  buildSuccessAccessibleRows,
  deriveTransactionOrderFilterControls,
  formatMajorMoney,
  formatMinorMoney,
  formatProviderMoney,
  parseTransactionDashboardQuery,
  parseTransactionDashboardQueryForSection,
  transactionStatusVariant,
  warningTranslationKey,
} from "@/components/layout/backend/admin/billing/transaction-finance-dashboard-helpers";

const routerPush = vi.fn();
const refundMutate = vi.fn();
let currentSearchParams = new URLSearchParams("section=overview&range=30d&page=2");

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/billing",
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => currentSearchParams,
}));

vi.mock("next/link", () => ({ default: ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children as never) }));
vi.mock("next-intl", () => ({
  useFormatter: () => ({
    dateTime: (value: Date, options: { dateStyle: string; timeStyle: string }) => `localized:${value.toISOString()}:${options.dateStyle}:${options.timeStyle}`,
  }),
  useTranslations: () => (key: string, values?: Record<string, string | number>) => values
    ? `${key}:${Object.values(values).join(":")}`
    : key,
}));
vi.mock("@tanstack/react-query", () => ({ useMutation: () => ({ mutate: refundMutate, isPending: false }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/services/admin", () => ({ createAdminTransactionRefund: vi.fn() }));
vi.mock("recharts", () => {
  const component = (name: string) => ({ children, ...props }: Record<string, unknown>) => createElement(`mock-${name}`, props, children as never);
  return {
    Bar: component("bar"), BarChart: component("bar-chart"), CartesianGrid: component("grid"), Legend: component("legend"),
    Line: component("line"), LineChart: component("line-chart"), ResponsiveContainer: component("responsive"), Tooltip: component("tooltip"),
    XAxis: component("x-axis"), YAxis: component("y-axis"),
  };
});
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children, ...props }: Record<string, unknown>) => createElement("mock-tabs", props, children as never),
  TabsContent: ({ children, ...props }: Record<string, unknown>) => createElement("mock-tabs-content", props, children as never),
  TabsList: ({ children, ...props }: Record<string, unknown>) => createElement("mock-tabs-list", props, children as never),
  TabsTrigger: ({ children, ...props }: Record<string, unknown>) => createElement("button", props, children as never),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, ...props }: Record<string, unknown>) => createElement("mock-select", props, children as never),
  SelectContent: ({ children, ...props }: Record<string, unknown>) => createElement("mock-select-content", props, children as never),
  SelectItem: ({ children, ...props }: Record<string, unknown>) => createElement("mock-select-item", props, children as never),
  SelectTrigger: ({ children, ...props }: Record<string, unknown>) => createElement("mock-select-trigger", props, children as never),
  SelectValue: (props: Record<string, unknown>) => createElement("mock-select-value", props),
}));

import { TransactionFinanceDashboard } from "@/components/layout/backend/admin/billing/transaction-finance-dashboard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const originalConsoleError = console.error;

beforeEach(() => {
  routerPush.mockReset();
  currentSearchParams = new URLSearchParams("section=overview&range=30d&page=2");
  vi.spyOn(console, "error").mockImplementation((message?: unknown, ...args: unknown[]) => {
    if (typeof message === "string" && message.startsWith("react-test-renderer is deprecated")) return;
    originalConsoleError(message, ...args);
  });
});

function renderedText(node: ReactTestInstance): string {
  return node.children.map((child) => typeof child === "string" ? child : renderedText(child)).join(" ");
}

const componentPath = join(
  process.cwd(),
  "src/components/layout/backend/admin/billing/transaction-finance-dashboard.tsx",
);

function readMessages(locale: "en" | "nl" | "fr") {
  return JSON.parse(readFileSync(join(process.cwd(), `src/messages/${locale}.json`), "utf8"));
}

function messageShape(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return typeof value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, messageShape(child)]));
}

function flattenedMessages(value: unknown, prefix = ""): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { [prefix]: String(value) };
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => Object.entries(flattenedMessages(child, prefix ? `${prefix}.${key}` : key))));
}

function messageArguments(message: string) {
  return [...message.matchAll(/\{([^},]+)(?:,[^}]*)?\}/g)].map((match) => match[1]).sort();
}

describe("transaction finance dashboard helpers", () => {
  it("formats major-unit dashboard amounts without multiplying them", () => {
    expect(formatMajorMoney(2.5, "EUR", "en-US")).toBe("€2.50");
  });

  it("converts minor-unit order amounts exactly once", () => {
    expect(formatMinorMoney(123456, "EUR", "en-US")).toBe("€1,234.56");
  });

  it("formats provider money as minor units", () => {
    expect(formatProviderMoney({ amount: 250, currency: "EUR" }, "en-US")).toBe("€2.50");
  });

  it("never throws for an invalid currency and uses a readable fallback", () => {
    expect(() => formatMajorMoney(2.5, "INVALID", "en-US")).not.toThrow();
    expect(formatMajorMoney(2.5, "INVALID", "en-US")).toBe("2.50 INVALID");
    expect(formatMinorMoney(250, "ABCD", "en-US")).toBe("2.50 ABCD");
  });

  it("assigns an explicit badge variant to every order status", () => {
    expect({
      pending_payment: transactionStatusVariant("pending_payment"),
      paid: transactionStatusVariant("paid"),
      failed: transactionStatusVariant("failed"),
      cancelled: transactionStatusVariant("cancelled"),
      refunded: transactionStatusVariant("refunded"),
      partially_refunded: transactionStatusVariant("partially_refunded"),
    }).toEqual({
      pending_payment: "secondary",
      paid: "default",
      failed: "destructive",
      cancelled: "outline",
      refunded: "secondary",
      partially_refunded: "secondary",
    });
  });

  it("keeps revenue series separated by currency", () => {
    expect(buildRevenueChartData([
      { period: "2026-08-01", amount: 12, currency: "EUR" },
      { period: "2026-08-01", amount: 20, currency: "USD" },
      { period: "2026-08-02", amount: 5, currency: "EUR" },
    ])).toEqual({
      currencies: ["EUR", "USD"],
      rows: [
        { period: "2026-08-01", EUR: 12, USD: 20 },
        { period: "2026-08-02", EUR: 5 },
      ],
    });
  });

  it("parses only supported transaction filters", () => {
    expect(parseTransactionDashboardQuery({
      range: "custom",
      startDate: "2026-07-01",
      endDate: ["2026-07-31", "ignored"],
      grouping: "week",
      currency: " eur ",
      status: "partially_refunded",
      productKey: "premiumContent",
      search: "alice@example.com",
      page: "3",
    })).toEqual({
      range: "custom",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      grouping: "week",
      currency: "EUR",
      status: "partially_refunded",
      productKey: "premiumContent",
      search: "alice@example.com",
      page: 3,
    });

    expect(parseTransactionDashboardQuery({
      range: "ytd",
      startDate: "2026-02-31",
      endDate: "not-a-date",
      grouping: "quarter",
      currency: "EUR<script>",
      status: "unknown",
      productKey: "not-configured",
      search: `  ${"x".repeat(256)}  `,
      page: "999999999",
      tab: "refunds",
    })).toEqual({ range: "30d", page: 1 });
    expect(parseTransactionDashboardQuery({ currency: "ABCD" })).toEqual({ range: "30d", page: 1 });
    expect(parseTransactionDashboardQuery({ currency: " usd " })).toEqual({ range: "30d", currency: "USD", page: 1 });
  });

  it("falls invalid custom bookmarks back to the default range without dates", () => {
    expect(parseTransactionDashboardQuery({ range: "custom", startDate: "2026-08-02", endDate: "2026-08-01" })).toEqual({ range: "30d", page: 1 });
    expect(parseTransactionDashboardQuery({ range: "custom", startDate: "2025-01-01", endDate: "2026-01-02" })).toEqual({ range: "30d", page: 1 });
    expect(parseTransactionDashboardQuery({ range: "custom", startDate: "2026-02-28", endDate: "2026-03-01" })).toEqual({ range: "custom", startDate: "2026-02-28", endDate: "2026-03-01", page: 1 });
  });

  it("preserves the canonical section and filters while removing legacy tab parameters", () => {
    const current = new URLSearchParams("section=overview&range=90d&status=failed&page=4");
    expect(buildTransactionDashboardHref("/admin/billing", current, { search: "order-42", page: 1 }))
      .toBe("/admin/billing?range=90d&status=failed&page=1&search=order-42");
    expect(buildTransactionDashboardHref("/admin/billing", current, { page: 3 }))
      .toBe("/admin/billing?range=90d&status=failed&page=3");
    expect(buildTransactionDashboardHref("/admin/billing", new URLSearchParams("tab=success&range=90d&page=4"), { page: 3 }))
      .toBe("/admin/billing?range=90d&page=3");
  });

  it("preserves order filters only when navigating within Orders", () => {
    const buildSectionHref = (transactionHelpers as typeof transactionHelpers & {
      buildTransactionSectionHref: (pathname: string, current: URLSearchParams, section: string) => string;
    }).buildTransactionSectionHref;

    expect(buildSectionHref).toBeTypeOf("function");
    const dashboard = new URLSearchParams("section=orders&tab=refunds&range=90d&grouping=week&currency=EUR&status=failed&productKey=starterContent&search=alice&page=4");
    expect(buildSectionHref("/admin/billing", dashboard, "orders"))
      .toBe("/admin/billing?section=orders&range=90d&status=failed&search=alice&page=1");
    expect(buildSectionHref("/admin/billing", dashboard, "success"))
      .toBe("/admin/billing");
    expect(buildSectionHref("/admin/billing", dashboard, "discounts"))
      .toBe("/admin/billing?section=discounts");
    expect(buildSectionHref("/admin/billing", new URLSearchParams("section=vouchers&range=90d&page=7"), "orders"))
      .toBe("/admin/billing?section=orders");
    expect(buildSectionHref("/admin/billing", new URLSearchParams("section=discounts&range=90d&page=7"), "overview"))
      .toBe("/admin/billing");
  });

  it("parses order filters only for the Orders section", () => {
    const params = {
      range: "90d",
      status: "failed",
      search: "alice",
      grouping: "week",
      currency: "EUR",
      productKey: "starterContent",
      page: "3",
    };

    expect(parseTransactionDashboardQueryForSection("orders", params))
      .toEqual({ range: "90d", status: "failed", search: "alice", page: 3 });
    expect(parseTransactionDashboardQueryForSection("refunds", params))
      .toEqual({ range: "30d", page: 3 });
    expect(parseTransactionDashboardQueryForSection("overview", params))
      .toEqual({ range: "30d", page: 3 });
  });

  it("derives only order filter controls from each server dashboard response", () => {
    const first = deriveTransactionOrderFilterControls({ range: "30d", startDate: "2026-07-08", endDate: "2026-08-06", grouping: "day", page: 1, pageSize: 20 });
    const changed = deriveTransactionOrderFilterControls({ range: "custom", startDate: "2026-01-01", endDate: "2026-01-31", grouping: "week", currency: "USD", status: "paid", productKey: "starterContent", search: "alice", page: 2, pageSize: 20 });
    expect(first).toEqual({ range: "30d", startDate: "2026-07-08", endDate: "2026-08-06", status: "all", search: "" });
    expect(changed).toEqual({ range: "custom", startDate: "2026-01-01", endDate: "2026-01-31", status: "paid", search: "alice" });
    expect(transactionHelpers).not.toHaveProperty("deriveTransactionFilterControls");
  });

  it("maps warning sources to localized keys without exposing service messages", () => {
    expect(warningTranslationKey("payment-provider-payments")).toBe("warnings.providerPayments");
    expect(warningTranslationKey("payment-provider-refunds")).toBe("warnings.providerRefunds");
    expect(warningTranslationKey("payment-provider-products")).toBe("warnings.providerProducts");
    expect(warningTranslationKey("payment-provider-products-page-cap")).toBe("warnings.providerPageCap");
    expect(warningTranslationKey("local-analytics")).toBe("warnings.analyticsTruncation");
    expect(warningTranslationKey("local-partial-refunds")).toBe("warnings.localPartialRefund");
    expect(warningTranslationKey("unexpected-secret-source")).toBe("warnings.generic");
  });

  it("builds textual chart alternatives containing every period and series value", () => {
    expect(buildRevenueAccessibleRows([
      { period: "2026-08-01", amount: 2.5, currency: "EUR" },
      { period: "2026-08-01", amount: 3, currency: "USD" },
    ], "en-US")).toEqual([{ period: "2026-08-01", values: ["EUR: €2.50", "USD: $3.00"] }]);
    expect(buildAttemptsAccessibleRows([{ period: "2026-08-01", success: 2, failed: 1, pending: 3, cancelled: 4 }]))
      .toEqual([{ period: "2026-08-01", success: 2, failed: 1, pending: 3, cancelled: 4 }]);
    expect(buildSuccessAccessibleRows([{ period: "2026-08-01", total: 4, successful: 3, rate: 75 }]))
      .toEqual([{ period: "2026-08-01", total: 4, successful: 3, rate: "75.00%" }]);
  });
});

describe("transaction finance dashboard component", () => {
  const source = readFileSync(componentPath, "utf8");

  it("renders one active section without nested tabs or URL tab routing", () => {
    expect(source).toContain("activeSection");
    expect(source).not.toContain("<Tabs");
    expect(source).not.toContain("TabsList");
    expect(source).not.toContain("TabsTrigger");
    expect(source).not.toContain("changeTab");
    expect(source).not.toContain("transactionDashboardTab");
  });

  it("renders warnings, empty states, charts, pagination, and all order fields", () => {
    for (const token of [
      "dashboard.warnings",
      "ResponsiveContainer",
      "buildRevenueChartData",
      "pagination.totalPages",
      "userName",
      "userEmail",
      "order.id",
      "order.items",
      "subtotalAmount",
      "taxAmount",
      "totalAmount",
      "paymentId",
      "createdAt",
      "formatMinorMoney",
      "formatMajorMoney",
      't("empty.orders")',
      't("empty.refunds")',
      't("empty.products")',
    ]) expect(source).toContain(token);
  });

  it("exposes every operational order and item field in an accessible expandable row", () => {
    expect(source).not.toContain("<details");
    expect(source).not.toContain("<summary");
    expect(source).toContain("<OrderDetails order={order} formatOrderDate={formatOrderDate} />");
    expect(source.match(/aria-expanded=\{expanded\}/g)).toHaveLength(1);
    expect(source.match(/aria-controls=\{detailsId\}/g)).toHaveLength(1);
    expect(source).not.toContain('<TableRow className="cursor-pointer" aria-expanded');
    expect(source).toContain("colSpan={6}");

    for (const field of [
      "order.subtotalAmount",
      "order.taxAmount",
      "order.totalAmount",
      "order.paymentId",
      "order.userId",
      "order.paymentProvider",
      "order.checkoutReferenceId",
      "order.createdAt",
      "order.paidAt",
      "order.failedAt",
      "order.fulfilledAt",
      "item.id",
      "item.productKey",
      "item.name",
      "item.description",
      "item.quantity",
      "item.unitPrice",
      "item.totalAmount",
      "item.currency",
      "item.providerProductId",
    ]) expect(source).toContain(field);

    for (const label of [
      "details.show",
      "details.subtotal",
      "details.tax",
      "details.total",
      "details.paymentId",
      "details.userId",
      "details.paymentProvider",
      "details.checkoutReferenceId",
      "details.createdAt",
      "details.paidAt",
      "details.failedAt",
      "details.fulfilledAt",
      "details.items",
      "details.itemId",
      "details.productKey",
      "details.name",
      "details.description",
      "details.quantity",
      "details.unitPrice",
      "details.itemTotal",
      "details.currency",
      "details.providerProductId",
    ]) expect(source).toContain(`t("${label}")`);

    expect(source).toContain('const notAvailable = t("table.notAvailable")');
    expect(source).toContain("useFormatter()");
    expect(source).toContain('dateStyle: "medium"');
    expect(source).toContain('timeStyle: "short"');
    expect(source).toContain("formatNullableDate(order.paidAt, notAvailable, formatOrderDate)");
    expect(source).toContain("order.paymentId ?? notAvailable");
    expect(source).toContain("item.description ?? notAvailable");
    expect(source).toContain("item.providerProductId ?? notAvailable");
  });

  it("uses one orders table for every payment status and exposes refund actions separately", () => {
    expect(source.match(/<OrdersCard /g)).toHaveLength(1);
    expect(source.match(/<OrdersTable rows=\{dashboard\.orders\.rows\}/g)).toHaveLength(1);
    expect(source).toContain("createAdminTransactionRefund");
    expect(source).toContain('t("refunds.action")');
    expect(source).not.toContain('t("refunds.readOnly")');
    expect(source).not.toContain(".raw");
  });

  it("uses transaction translations for user-facing copy", () => {
    expect(source).toContain('useTranslations("admin.billing.transactionsMode")');
    expect(source).toContain('aria-label={t("charts.revenueDescription")}');
    expect(source).toContain('aria-label={t("charts.attemptsDescription")}');
    expect(source).toContain('aria-label={t("charts.successDescription")}');
    expect(source).toContain('aria-describedby="transaction-revenue-data"');
    expect(source).toContain('aria-describedby="transaction-attempts-data"');
    expect(source).toContain('aria-describedby="transaction-success-data"');
    expect(source.match(/className="sr-only"/g)?.length).toBeGreaterThanOrEqual(4);
    expect(source).not.toContain("warning.message");
  });

  it("resynchronizes filter state from response props", () => {
    expect(source).toContain("key={JSON.stringify(dashboard.filters)}");
    expect(source).toContain("deriveTransactionOrderFilterControls(filters)");
    expect(source).not.toContain("deriveTransactionFilterControls");
  });
});

describe("transaction finance dashboard messages", () => {
  it("defines exactly the same keys and ICU arguments in every supported locale", () => {
    const messages = Object.fromEntries((["en", "nl", "fr"] as const).map((locale) => [
      locale,
      flattenedMessages(readMessages(locale).admin.billing.transactionsMode),
    ]));
    const expectedKeys = Object.keys(messages.en).sort();

    for (const locale of ["nl", "fr"] as const) {
      expect(Object.keys(messages[locale]).sort()).toEqual(expectedKeys);
      for (const key of expectedKeys) {
        expect(messageArguments(messages[locale][key]), `${locale}:${key}`).toEqual(messageArguments(messages.en[key]));
      }
    }

    expect(messageShape(readMessages("nl").admin.billing.transactionsMode)).toEqual(messageShape(readMessages("en").admin.billing.transactionsMode));
    expect(messageShape(readMessages("fr").admin.billing.transactionsMode)).toEqual(messageShape(readMessages("en").admin.billing.transactionsMode));
  });

  it("uses natural Dutch and French copy rather than English placeholders", () => {
    const en = readMessages("en").admin.billing.transactionsMode;
    const nl = readMessages("nl").admin.billing.transactionsMode;
    const fr = readMessages("fr").admin.billing.transactionsMode;

    expect(nl.title).not.toBe(en.title);
    expect(nl.tabs.orders).toContain("Bestellingen");
    expect(nl.filters.apply).toBe("Toepassen");
    expect(nl.status.refunded).toContain("Terugbetaald");
    expect(nl.warnings.generic).toContain("transactiedashboard");
    expect(fr.title).not.toBe(en.title);
    expect(fr.tabs.orders).toContain("Commandes");
    expect(fr.filters.apply).toBe("Appliquer");
    expect(fr.status.refunded).toContain("Remboursé");
    expect(fr.warnings.generic).toContain("tableau de bord");
    expect(en.table.customer).toBe("Customer");
    expect(nl.table.customer).toBe("Klant");
    expect(fr.table.customer).toBe("Client");

    const allowedIdenticalValues = {
      nl: ["filters.status", "filters.product", "grouping.week", "table.quantity", "table.status", "provider.provider", "products.product"],
      fr: ["table.quantity", "table.total", "details.total", "details.description"],
    };
    const english = flattenedMessages(en);
    for (const [locale, localized] of [["nl", nl], ["fr", fr]] as const) {
      const identical = Object.entries(flattenedMessages(localized)).filter(([key, value]) => value === english[key]).map(([key]) => key);
      expect(identical).toEqual(allowedIdenticalValues[locale]);
    }
  });

  it("defines localized order expansion labels with matching ICU arguments", () => {
    const en = readMessages("en").admin.billing.transactionsMode.details;
    const nl = readMessages("nl").admin.billing.transactionsMode.details;
    const fr = readMessages("fr").admin.billing.transactionsMode.details;

    expect(en.expand).toBe("Show details for order {orderId}");
    expect(en.collapse).toBe("Hide details for order {orderId}");
    expect(nl.expand).toBe("Details voor bestelling {orderId} tonen");
    expect(nl.collapse).toBe("Details voor bestelling {orderId} verbergen");
    expect(fr.expand).toBe("Afficher les détails de la commande {orderId}");
    expect(fr.collapse).toBe("Masquer les détails de la commande {orderId}");
  });
});

function dashboardFixture(overrides: Partial<AdminTransactionFinanceDashboard> = {}): AdminTransactionFinanceDashboard {
  const order = {
    id: "order-visible-1", userId: "user-visible-1", userName: "Alice Admin", userEmail: "alice@example.com", status: "paid" as const,
    currency: "EUR", subtotalAmount: 200, taxAmount: 50, totalAmount: 250, paymentProvider: "dodo", paymentId: "pay-visible-1",
    checkoutReferenceId: "checkout-visible-1", createdAt: "2026-08-01T10:00:00.000Z", paidAt: "2026-08-01T10:01:00.000Z",
    failedAt: null, fulfilledAt: "2026-08-01T10:02:00.000Z", items: [{ id: "item-visible-1", productKey: "starterContent", quantity: 1,
      unitPrice: 250, totalAmount: 250, currency: "EUR", providerProductId: "provider-product-visible-1", name: "Starter content", description: "Visible description" }],
  };
  const secondOrder = {
    ...order,
    id: "order-visible-2",
    userId: "user-visible-2",
    userName: "Bob Buyer",
    userEmail: "bob@example.com",
    subtotalAmount: 400,
    taxAmount: 100,
    totalAmount: 500,
    paymentId: "pay-visible-2",
    checkoutReferenceId: "checkout-visible-2",
    items: [{ ...order.items[0], id: "item-visible-2", providerProductId: "provider-product-visible-2", name: "Premium content" }],
  };
  const pagination = { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 };
  return {
    filters: { range: "30d", startDate: "2026-07-03", endDate: "2026-08-01", grouping: "day", page: 1, pageSize: 20 },
    warnings: [], overview: { amounts: [{ currency: "EUR", grossRevenue: 2.5, preTaxRevenue: 2, taxCollected: 0.5, refundedAmount: 0 }],
      successfulOrders: 1, pendingAttempts: 0, failedAttempts: 0, cancelledAttempts: 0, refundedOrders: 0, conversionRate: 100, totalAttempts: 1 },
    revenue: [{ period: "2026-08-01", amount: 2.5, currency: "EUR" }],
    attempts: [{ period: "2026-08-01", success: 1, failed: 0, pending: 0, cancelled: 0 }],
    successRate: [{ period: "2026-08-01", total: 1, successful: 1, rate: 100 }],
    orderTrends: [
      { range: "30d", total: 2, successful: 2, failed: 0, points: [{ period: "2026-08-01", total: 2, successful: 2, failed: 0 }] },
      { range: "90d", total: 2, successful: 2, failed: 0, points: [{ period: "2026-08-01", total: 2, successful: 2, failed: 0 }] },
      { range: "180d", total: 2, successful: 2, failed: 0, points: [{ period: "2026-08-01", total: 2, successful: 2, failed: 0 }] },
    ],
    orders: { rows: [order, secondOrder], pagination },
    refunds: { refundableRows: [order, secondOrder], localRows: [], providerRows: [], totalAmounts: [] }, products: { rows: [], providerRows: [] }, ...overrides,
  };
}

describe("transaction finance dashboard rendered behavior", () => {
  let renderer: ReactTestRenderer;

  it("renders the header and exactly the selected section content", async () => {
    const expected = {
      overview: "overview.conversionRate",
      orders: "orders.title",
      refunds: "refunds.refundableTitle",
      products: "products.localTitle",
    } as const;

    for (const [activeSection, marker] of Object.entries(expected)) {
      await act(async () => {
        renderer = create(createElement(TransactionFinanceDashboard, {
          activeSection: activeSection as keyof typeof expected,
          dashboard: dashboardFixture(),
        }));
      });
      const text = renderedText(renderer.root);
      expect(text).toContain("title");
      expect(text).toContain(marker);
      for (const otherMarker of Object.values(expected).filter((value) => value !== marker)) {
        expect(text).not.toContain(otherMarker);
      }
    }
  });

  it("renders compact filters only for Orders", async () => {
    for (const activeSection of ["overview", "refunds", "products"] as const) {
      await act(async () => { renderer = create(createElement(TransactionFinanceDashboard, { activeSection, dashboard: dashboardFixture() })); });
      expect(renderer.root.findAllByType("form"), activeSection).toHaveLength(0);
    }

    await act(async () => { renderer = create(createElement(TransactionFinanceDashboard, { activeSection: "orders", dashboard: dashboardFixture() })); });
    expect(renderer.root.findAllByType("form")).toHaveLength(1);
    expect(renderer.root.findAll((node) => node.props.id === "transaction-range")).not.toHaveLength(0);
    expect(renderer.root.findAll((node) => node.props.id === "transaction-status")).not.toHaveLength(0);
    expect(renderer.root.findAll((node) => node.type === "input" && node.props.id === "transaction-search")).toHaveLength(1);
    expect(renderer.root.findAll((node) => node.props.id === "transaction-grouping")).toHaveLength(0);
    expect(renderer.root.findAll((node) => node.props.id === "transaction-currency")).toHaveLength(0);
    expect(renderer.root.findAll((node) => node.props.id === "transaction-product")).toHaveLength(0);
  });

  it("renders six compact columns and allows only one expanded order", async () => {
    await act(async () => { renderer = create(createElement(TransactionFinanceDashboard, { activeSection: "orders", dashboard: dashboardFixture() })); });
    expect(renderer.root.findAllByType("th").map(renderedText)).toEqual([
      "table.customer", "table.order", "table.total", "table.status", "table.created", "details.show",
    ]);
    const buttons = () => renderer.root.findAllByType("button").filter((button) => button.props["aria-controls"]);
    expect(buttons().map((button) => button.props["aria-expanded"])).toEqual([false, false]);
    expect(renderedText(renderer.root)).not.toContain("pay-visible-1");
    expect(renderedText(renderer.root)).not.toContain("pay-visible-2");
    expect(renderedText(renderer.root)).toContain("localized:2026-08-01T10:00:00.000Z:medium:short");

    const primaryRows = renderer.root.findAllByType("tr").filter((row) => typeof row.props.onClick === "function");
    expect(primaryRows).toHaveLength(2);
    expect(primaryRows.every((row) => row.props["aria-expanded"] === undefined && row.props["aria-controls"] === undefined)).toBe(true);
    await act(async () => primaryRows[0].props.onClick());
    expect(buttons().map((button) => button.props["aria-expanded"])).toEqual([true, false]);
    let text = renderedText(renderer.root);
    for (const value of ["details.subtotal", "details.tax", "details.total", "details.paymentId", "pay-visible-1", "user-visible-1", "checkout-visible-1", "item-visible-1", "provider-product-visible-1", "Visible description"]) expect(text).toContain(value);
    for (const timestamp of ["10:00:00.000Z", "10:01:00.000Z", "10:02:00.000Z"]) expect(text).toContain(`localized:2026-08-01T${timestamp}:medium:short`);
    expect(text).not.toContain("pay-visible-2");

    await act(async () => buttons()[1].props.onClick({ stopPropagation: vi.fn() }));
    expect(buttons().map((button) => button.props["aria-expanded"])).toEqual([false, true]);
    text = renderedText(renderer.root);
    expect(text).not.toContain("pay-visible-1");
    expect(text).toContain("pay-visible-2");

    await act(async () => buttons()[1].props.onClick({ stopPropagation: vi.fn() }));
    expect(buttons().map((button) => button.props["aria-expanded"])).toEqual([false, false]);
    expect(renderedText(renderer.root)).not.toContain("pay-visible-1");
    expect(renderedText(renderer.root)).not.toContain("pay-visible-2");
    expect(renderer.root.findAll((node) => node.type === "div" && String(node.props.className).includes("overflow-x-auto")).length).toBeGreaterThan(0);
  });

  it("resets expanded orders when changing section", async () => {
    const dashboard = dashboardFixture();
    await act(async () => { renderer = create(createElement(TransactionFinanceDashboard, { activeSection: "orders", dashboard })); });
    const buttons = () => renderer.root.findAllByType("button").filter((button) => button.props["aria-controls"]);

    await act(async () => buttons()[0].props.onClick({ stopPropagation: vi.fn() }));
    expect(buttons()[0].props["aria-expanded"]).toBe(true);
    await act(async () => renderer.update(createElement(TransactionFinanceDashboard, { activeSection: "overview", dashboard })));
    expect(buttons()).toHaveLength(0);
  });

  it("resets expanded orders when changing Orders page", async () => {
    const firstPage = dashboardFixture();
    await act(async () => { renderer = create(createElement(TransactionFinanceDashboard, { activeSection: "orders", dashboard: firstPage })); });
    const buttons = () => renderer.root.findAllByType("button").filter((button) => button.props["aria-controls"]);

    await act(async () => buttons()[0].props.onClick({ stopPropagation: vi.fn() }));
    expect(buttons()[0].props["aria-expanded"]).toBe(true);
    const secondPage = dashboardFixture({
      orders: { ...firstPage.orders, pagination: { ...firstPage.orders.pagination, page: 2, totalPages: 2 } },
    });
    await act(async () => renderer.update(createElement(TransactionFinanceDashboard, { activeSection: "orders", dashboard: secondPage })));
    expect(buttons().every((button) => button.props["aria-expanded"] === false)).toBe(true);
  });

  it("reuses the collapsed order table for local refunds without order filters", async () => {
    const fixture = dashboardFixture();
    const refundDashboard = dashboardFixture({
      refunds: { ...fixture.refunds, refundableRows: [], localRows: fixture.orders.rows },
    });
    await act(async () => { renderer = create(createElement(TransactionFinanceDashboard, { activeSection: "refunds", dashboard: refundDashboard })); });
    expect(renderer.root.findAllByType("form")).toHaveLength(0);
    const expandButtons = renderer.root.findAllByType("button").filter((button) => button.props["aria-controls"]);
    expect(expandButtons).not.toHaveLength(0);
    expect(expandButtons.every((button) => button.props["aria-expanded"] === false)).toBe(true);
  });

  it("renders chart data as associated visually hidden text", async () => {
    await act(async () => { renderer = create(createElement(TransactionFinanceDashboard, { activeSection: "overview", dashboard: dashboardFixture() })); });
    const hiddenTables = renderer.root.findAll((node) => node.type === "table" && node.props.className === "sr-only");
    expect(hiddenTables).toHaveLength(3);
    const text = hiddenTables.map(renderedText).join(" ");
    expect(text).toContain("2026-08-01");
    expect(text).toContain("EUR");
    expect(text).toContain("2.50");
    expect(text).toContain("100.00%");
  });

  it("localizes provider statuses without exposing warning sources", async () => {
    const dashboard = dashboardFixture({
      warnings: [{ source: "secret-provider-error", message: "sensitive provider failure" }],
      refunds: {
        localRows: [],
        refundableRows: [],
        providerRows: [{
          provider: "dodo",
          refundId: "refund-visible-1",
          paymentId: "pay-visible-1",
          status: "succeeded",
          amount: null,
          createdAt: null,
          reason: null,
        }],
        totalAmounts: [],
      },
    });

    await act(async () => { renderer = create(createElement(TransactionFinanceDashboard, { activeSection: "refunds", dashboard })); });
    const text = renderedText(renderer.root);
    expect(text).toContain("warnings.title");
    expect(text).not.toContain("secret-provider-error");
    expect(text).not.toContain("sensitive provider failure");
    expect(text).toContain("providerStatus.successful");
    expect(text).not.toContain("succeeded");
  });

  it("applies and clears Orders filters without retaining removed controls", async () => {
    currentSearchParams = new URLSearchParams("section=orders&range=30d&page=2&grouping=week&currency=EUR&productKey=starterContent");
    await act(async () => { renderer = create(createElement(TransactionFinanceDashboard, { activeSection: "orders", dashboard: dashboardFixture() })); });
    const selects = renderer.root.findAll((node) => String(node.type) === "mock-select");
    await act(async () => selects[0].props.onValueChange("90d"));
    await act(async () => selects[1].props.onValueChange("failed"));
    const search = renderer.root.findByProps({ id: "transaction-search" });
    await act(async () => search.props.onChange({ target: { value: " order-visible " } }));
    const form = renderer.root.findByType("form");
    await act(async () => form.props.onSubmit({ preventDefault: vi.fn() }));
    expect(routerPush).toHaveBeenLastCalledWith("/admin/billing?section=orders&range=90d&page=1&status=failed&search=order-visible");

    const clear = renderer.root.findAllByType("button").find((button) => renderedText(button) === "filters.clear");
    expect(clear).toBeDefined();
    await act(async () => clear?.props.onClick());
    expect(routerPush).toHaveBeenLastCalledWith("/admin/billing?section=orders&range=30d&page=1");
  });

  it("resynchronizes Orders filters after new server props", async () => {
    currentSearchParams = new URLSearchParams("section=orders&range=30d&page=2");
    await act(async () => { renderer = create(createElement(TransactionFinanceDashboard, { activeSection: "orders", dashboard: dashboardFixture() })); });
    const changed = dashboardFixture({ filters: { range: "custom", startDate: "2026-06-01", endDate: "2026-06-30", grouping: "week", currency: "USD", status: "paid", productKey: "starterContent", search: "alice", page: 1, pageSize: 20 } });
    await act(async () => renderer.update(createElement(TransactionFinanceDashboard, { activeSection: "orders", dashboard: changed })));
    expect(renderer.root.findAll((node) => String(node.type) === "mock-select").map((node) => node.props.value)).toEqual(["custom", "paid"]);
    expect(renderer.root.findByProps({ id: "transaction-search" }).props.value).toBe("alice");
    expect(renderer.root.findByProps({ id: "transaction-start-date" }).props.value).toBe("2026-06-01");
    expect(renderer.root.findByProps({ id: "transaction-end-date" }).props.value).toBe("2026-06-30");
  });
});
