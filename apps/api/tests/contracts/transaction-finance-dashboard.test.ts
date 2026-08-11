import { describe, expect, it } from "vitest";

import {
  adminTransactionFinanceDashboardSchema,
  adminTransactionFinanceDashboardQuerySchema,
  transactionOrderStatusSchema,
} from "@platform/contracts";
import { apiRoutes } from "@platform/contracts/ts";

describe("admin transaction finance dashboard contracts", () => {
  it("defaults the range and page while trimming bounded filters", () => {
    expect(adminTransactionFinanceDashboardQuerySchema.parse({
      currency: " eur ",
      productKey: " starterContent ",
      search: " customer@example.com ",
    })).toEqual({
      range: "30d",
      currency: "EUR",
      productKey: "starterContent",
      search: "customer@example.com",
      page: 1,
    });
  });

  it("accepts every transaction order status", () => {
    expect(transactionOrderStatusSchema.options).toEqual([
      "pending_payment",
      "paid",
      "failed",
      "cancelled",
      "refund_pending",
      "refunded",
      "partially_refunded",
    ]);
  });

  it("requires real ordered ISO dates for a custom range", () => {
    expect(adminTransactionFinanceDashboardQuerySchema.safeParse({ range: "custom", startDate: "2026-02-28", endDate: "2026-03-01" }).success).toBe(true);
    expect(adminTransactionFinanceDashboardQuerySchema.safeParse({ range: "custom", startDate: "2026-02-31", endDate: "2026-03-01" }).success).toBe(false);
    expect(adminTransactionFinanceDashboardQuerySchema.safeParse({ range: "custom", startDate: "2026-03-02", endDate: "2026-03-01" }).success).toBe(false);
    expect(adminTransactionFinanceDashboardQuerySchema.safeParse({ range: "custom", startDate: "2026-03-01" }).success).toBe(false);
    expect(adminTransactionFinanceDashboardQuerySchema.safeParse({ range: "custom", startDate: "2025-01-01", endDate: "2026-01-02" }).success).toBe(false);
    expect(adminTransactionFinanceDashboardQuerySchema.safeParse({ range: "custom", startDate: "2025-01-02", endDate: "2026-01-02" }).success).toBe(true);
  });

  it("rejects invalid grouping, status, page, and oversized search", () => {
    expect(adminTransactionFinanceDashboardQuerySchema.safeParse({ grouping: "quarter" }).success).toBe(false);
    expect(adminTransactionFinanceDashboardQuerySchema.safeParse({ status: "processing" }).success).toBe(false);
    expect(adminTransactionFinanceDashboardQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(adminTransactionFinanceDashboardQuerySchema.safeParse({ page: 10_001 }).success).toBe(false);
    expect(adminTransactionFinanceDashboardQuerySchema.safeParse({ currency: "ABCD" }).success).toBe(false);
    expect(adminTransactionFinanceDashboardQuerySchema.safeParse({ currency: "EUR<script>" }).success).toBe(false);
    expect(adminTransactionFinanceDashboardQuerySchema.safeParse({ search: "x".repeat(256) }).success).toBe(false);
  });

  it("coerces Hono query-string page values", () => {
    expect(adminTransactionFinanceDashboardQuerySchema.parse({ page: "3" }).page).toBe(3);
    expect(adminTransactionFinanceDashboardQuerySchema.safeParse({ page: "3.5" }).success).toBe(false);
  });

  it("builds a safely encoded transaction dashboard URL without undefined fields", () => {
    expect(apiRoutes.admin.billingTransactionFinanceDashboard({
      range: "custom",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      grouping: "week",
      currency: "EUR",
      status: "partially_refunded",
      productKey: "content & review",
      search: "alice+admin@example.com",
      page: 2,
    })).toBe(
      "/admin/billing/transaction-dashboard?range=custom&startDate=2026-07-01&endDate=2026-07-31&grouping=week&currency=EUR&status=partially_refunded&productKey=content+%26+review&search=alice%2Badmin%40example.com&page=2",
    );
    expect(apiRoutes.admin.billingTransactionFinanceDashboard({ search: undefined })).toBe(
      "/admin/billing/transaction-dashboard",
    );
    expect(apiRoutes.admin.billingTransactionFinanceDashboard()).not.toContain("undefined");
  });

  it("strips raw provider fields from dashboard-specific wire rows", () => {
    const parsed = adminTransactionFinanceDashboardSchema.parse({
      filters: { startDate: "2026-08-01", endDate: "2026-08-06", grouping: "day", range: "7d", page: 1, pageSize: 20 },
      warnings: [],
      overview: { amounts: [], successfulOrders: 0, pendingAttempts: 0, failedAttempts: 0, cancelledAttempts: 0, refundedOrders: 0, conversionRate: 0, totalAttempts: 0 },
      revenue: [], attempts: [], successRate: [], orderTrends: [],
      orders: { rows: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 } },
      refunds: { refundableRows: [], localRows: [], providerRows: [{ provider: "dodo", refundId: "r1", paymentId: "p1", status: "succeeded", amount: null, createdAt: null, reason: null, raw: { secret: true } }], totalAmounts: [] },
      products: { rows: [], providerRows: [{ provider: "dodo", productId: "product-1", name: null, description: null, price: null, isRecurring: false, taxCategory: null, createdAt: null, updatedAt: null, raw: { secret: true } }] },
      providerPayments: [{ provider: "dodo", paymentId: "p1", subscriptionId: null, customer: null, amount: null, createdAt: null, invoiceUrl: null, refundStatus: null, disputeStatus: null, paymentMethod: null, paymentMethodType: null, errorCode: null, errorMessage: null, raw: { secret: true } }],
    });

    expect(parsed.refunds.providerRows[0]).not.toHaveProperty("raw");
    expect(parsed.products.providerRows[0]).not.toHaveProperty("raw");
    expect(parsed).not.toHaveProperty("providerPayments");
  });
});
