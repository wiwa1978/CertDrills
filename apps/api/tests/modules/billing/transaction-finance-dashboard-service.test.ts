import { describe, expect, it, vi } from "vitest";

import { adminTransactionFinanceDashboardSchema } from "@platform/contracts";

import {
  adminTransactionSearchPattern,
  createAdminTransactionFinanceDashboardService,
  matchesAdminTransactionSearch,
  normalizeAdminTransactionDashboardQuery,
} from "../../../src/modules/billing/transaction-finance-dashboard-service";

const NOW = new Date("2026-08-06T12:00:00.000Z");

function chain(result: unknown[], calls: Array<{ method: string; args: unknown[] }>) {
  const query: Record<string, unknown> = {};
  for (const method of ["from", "leftJoin", "innerJoin", "where", "groupBy", "orderBy", "limit", "offset"]) {
    query[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return query;
    };
  }
  query.then = (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function createSqlDb(results: unknown[][], options: {
  items?: unknown[];
  entitlements?: unknown[];
} = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let index = 0;
  const select = vi.fn(() => chain(results[index++] ?? [], calls));
  return {
    db: {
      select,
      query: {
        transactionOrderItems: { findMany: vi.fn().mockResolvedValue(options.items ?? []) },
        transactionEntitlements: { findMany: vi.fn().mockResolvedValue(options.entitlements ?? []) },
      },
    },
    calls,
    select,
  };
}

function pageOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    userId: "user-1",
    status: "paid",
    currency: "EUR",
    subtotalAmount: 800,
    taxAmount: 200,
    totalAmount: 1000,
    paymentProvider: "dodo",
    paymentId: "pay-1",
    checkoutReferenceId: "checkout-1",
    createdAt: new Date("2026-08-06T10:00:00.000Z"),
    paidAt: new Date("2026-08-06T10:01:00.000Z"),
    failedAt: null,
    fulfilledAt: new Date("2026-08-06T10:02:00.000Z"),
    userName: "Alice",
    userEmail: "alice@example.com",
    ...overrides,
  };
}

function dashboardResults(orderRows: unknown[] = [pageOrder()]) {
  return [
    orderRows,
    [{ count: 10_000 }],
    [{
      currency: "EUR",
      totalAttempts: 10_000,
      successfulOrders: 7_500,
      pendingAttempts: 1_000,
      failedAttempts: 1_000,
      cancelledAttempts: 500,
      refundedOrders: 250,
      grossRevenue: 7_500_000,
      preTaxRevenue: 6_000_000,
      taxCollected: 1_500_000,
      refundedAmount: 100_000,
      partialRefunds: 0,
    }],
    [{ period: "2026-08-06T00:00:00.000Z", currency: "EUR", amount: 200_000 }],
    [{ period: "2026-08-06T00:00:00.000Z", success: 75, failed: 10, pending: 10, cancelled: 5 }],
    [{ productKey: "starterContent", currency: "EUR", unitsSold: 120, orderCount: 100, grossRevenue: 500_000, name: "Starter content" }],
    [{ period: "2026-08-06T00:00:00.000Z", total: 100, successful: 75, failed: 10 }],
    [{ period: "2026-08-03T00:00:00.000Z", total: 400, successful: 300, failed: 40 }],
    [{ period: "2026-08-01T00:00:00.000Z", total: 800, successful: 600, failed: 80 }],
  ];
}

describe("transaction finance dashboard query normalization", () => {
  it("uses inclusive date ranges and bounded grouping defaults", () => {
    expect(normalizeAdminTransactionDashboardQuery({}, NOW)).toEqual({
      range: "30d",
      startDate: "2026-07-08",
      endDate: "2026-08-06",
      grouping: "day",
      currency: undefined,
      status: undefined,
      productKey: undefined,
      search: undefined,
      page: 1,
      pageSize: 20,
    });
    expect(normalizeAdminTransactionDashboardQuery({ range: "90d" }, NOW).grouping).toBe("week");
    expect(normalizeAdminTransactionDashboardQuery({ range: "12m" }, NOW).grouping).toBe("month");
  });

  it("rejects invalid and oversized custom ranges", () => {
    expect(() => normalizeAdminTransactionDashboardQuery({ range: "custom", startDate: "2026-08-02", endDate: "2026-08-01" }, NOW)).toThrow("Invalid custom transaction dashboard range");
    expect(() => normalizeAdminTransactionDashboardQuery({ range: "custom", startDate: "2025-01-01", endDate: "2026-01-02" }, NOW)).toThrow("Custom transaction dashboard range cannot exceed 366 days");
  });

  it("escapes SQL wildcard searches and preserves user matching semantics", () => {
    expect(adminTransactionSearchPattern("a%_\\b")).toBe("%a\\%\\_\\\\b%");
    expect(matchesAdminTransactionSearch({ id: "order-1" }, { email: "Alice@Example.com" }, "alice")).toBe(true);
  });
});

describe("admin transaction finance SQL dashboard", () => {
  it("keeps analytics complete while loading only one detail page", async () => {
    const setup = createSqlDb(dashboardResults(), {
      items: [{
        id: "item-1",
        orderId: "order-1",
        productKey: "starterContent",
        quantity: 2,
        unitPrice: 500,
        totalAmount: 1000,
        currency: "EUR",
        providerProductId: "provider-basic",
        metadata: { name: "Starter content", description: "Access" },
      }],
    });
    const result = await createAdminTransactionFinanceDashboardService({ db: setup.db as never, now: () => NOW }).getDashboard({ range: "7d" });

    expect(result.overview).toMatchObject({ totalAttempts: 10_000, successfulOrders: 7_500, conversionRate: 75 });
    expect(result.overview.amounts).toEqual([{ currency: "EUR", grossRevenue: 75_000, preTaxRevenue: 60_000, taxCollected: 15_000, refundedAmount: 1_000 }]);
    expect(result.orders).toMatchObject({ pagination: { page: 1, pageSize: 20, totalItems: 10_000, totalPages: 500 } });
    expect(result.orders.rows).toHaveLength(1);
    expect(result.orders.rows[0]).toMatchObject({ userName: "Alice", items: [{ name: "Starter content" }] });
    expect(result.products.rows).toEqual([{ productKey: "starterContent", name: "Starter content", unitsSold: 120, orderCount: 100, grossRevenue: 5_000, currency: "EUR" }]);
    expect(result.revenue.at(-1)).toEqual({ period: "2026-08-06", amount: 2_000, currency: "EUR" });
    expect(result.orderTrends.map((trend) => trend.total)).toEqual([100, 400, 800]);
    expect(adminTransactionFinanceDashboardSchema.parse(result)).toEqual(result);
  });

  it("applies stable 20-row SQL pagination independently of aggregate queries", async () => {
    const setup = createSqlDb(dashboardResults([]));
    const result = await createAdminTransactionFinanceDashboardService({ db: setup.db as never, now: () => NOW }).getDashboard({ range: "7d", page: 2 });

    expect(result.orders.pagination.page).toBe(2);
    expect(setup.calls.some((call) => call.method === "limit" && call.args[0] === 20)).toBe(true);
    expect(setup.calls.some((call) => call.method === "offset" && call.args[0] === 20)).toBe(true);
  });

  it("returns explicit zero partitions and partial-refund completeness warnings", async () => {
    const results = dashboardResults([]);
    results[2] = [{
      currency: "EUR",
      totalAttempts: 1,
      successfulOrders: 1,
      pendingAttempts: 0,
      failedAttempts: 0,
      cancelledAttempts: 0,
      refundedOrders: 1,
      grossRevenue: 1000,
      preTaxRevenue: 800,
      taxCollected: 200,
      refundedAmount: 0,
      partialRefunds: 1,
    }];
    const setup = createSqlDb(results);
    const result = await createAdminTransactionFinanceDashboardService({ db: setup.db as never, now: () => NOW }).getDashboard({ range: "7d", currency: "EUR" });

    expect(result.refunds.totalAmounts).toEqual([{ currency: "EUR", amount: 0 }]);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ source: "local-partial-refunds" })]));
  });
});
