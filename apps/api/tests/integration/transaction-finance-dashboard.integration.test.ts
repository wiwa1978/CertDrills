import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import {
  transactionOrderItems,
  transactionOrders,
  user,
  type TransactionOrderStatus,
} from "@platform/platform-db";

import { createAdminTransactionFinanceDashboardService } from "../../src/modules/billing/transaction-finance-dashboard-service";
import { fixtureToken, openTestDatabase } from "../support/database";

const NOW = new Date("2026-08-09T12:00:00.000Z");
const fixtureUserIds = new Set<string>();
let database: ReturnType<typeof openTestDatabase>;

async function seedTransactionOrders() {
  const fixture = fixtureToken("finance");
  const [fixtureUser] = await database.db
    .insert(user)
    .values({
      name: "Finance Integration User",
      email: `${fixture}@example.test`,
      emailVerified: true,
      role: "user",
    })
    .returning({ id: user.id });
  if (!fixtureUser) throw new Error("Failed to create finance integration user");
  fixtureUserIds.add(fixtureUser.id);

  const definitions: Array<{
    status: TransactionOrderStatus;
    subtotalAmount: number;
    taxAmount: number;
    createdAt: Date;
  }> = [
    { status: "paid", subtotalAmount: 800, taxAmount: 200, createdAt: new Date("2026-08-01T10:00:00.000Z") },
    { status: "failed", subtotalAmount: 1200, taxAmount: 300, createdAt: new Date("2026-08-02T10:00:00.000Z") },
    { status: "pending_payment", subtotalAmount: 400, taxAmount: 100, createdAt: new Date("2026-08-03T10:00:00.000Z") },
    { status: "refunded", subtotalAmount: 1600, taxAmount: 400, createdAt: new Date("2026-08-04T10:00:00.000Z") },
  ];

  const orders = await database.db
    .insert(transactionOrders)
    .values(definitions.map((definition, index) => ({
      userId: fixtureUser.id,
      status: definition.status,
      currency: "EUR",
      subtotalAmount: definition.subtotalAmount,
      taxAmount: definition.taxAmount,
      totalAmount: definition.subtotalAmount + definition.taxAmount,
      paymentProvider: "dodo",
      paymentId: `${fixture}-payment-${index}`,
      checkoutReferenceId: `${fixture}-checkout-${index}`,
      createdAt: definition.createdAt,
      paidAt: definition.status === "paid" || definition.status === "refunded" ? definition.createdAt : null,
      failedAt: definition.status === "failed" ? definition.createdAt : null,
      fulfilledAt: definition.status === "paid" || definition.status === "refunded" ? definition.createdAt : null,
    })))
    .returning({ id: transactionOrders.id, status: transactionOrders.status, totalAmount: transactionOrders.totalAmount });

  const successfulOrders = orders.filter((order) => order.status === "paid" || order.status === "refunded");
  await database.db.insert(transactionOrderItems).values(successfulOrders.map((order, index) => ({
    orderId: order.id,
    productKey: "starterContent",
    quantity: 1,
    unitPrice: order.totalAmount,
    totalAmount: order.totalAmount,
    currency: "EUR",
    providerProductId: `provider-basic-${index}`,
    metadata: { name: "Starter content", description: "Integration fixture" },
  })));
}

describe("transaction finance dashboard PostgreSQL integration", () => {
  beforeAll(() => {
    database = openTestDatabase();
  });

  afterEach(async () => {
    for (const userId of fixtureUserIds) {
      await database.db.delete(user).where(eq(user.id, userId));
    }
    fixtureUserIds.clear();
  });

  afterAll(async () => {
    await database.sql.end();
  });

  it("executes every supported date grouping and returns complete aggregates", async () => {
    await seedTransactionOrders();
    const service = createAdminTransactionFinanceDashboardService({ db: database.db, now: () => NOW });

    for (const grouping of ["day", "week", "month", "year"] as const) {
      const dashboard = await service.getDashboard({ range: "30d", grouping });

      expect(dashboard.overview).toMatchObject({
        totalAttempts: 4,
        successfulOrders: 2,
        pendingAttempts: 1,
        failedAttempts: 1,
      });
      expect(dashboard.attempts.reduce(
        (total, point) => total + point.success + point.failed + point.pending + point.cancelled,
        0,
      )).toBe(4);
      expect(dashboard.revenue.reduce((total, point) => total + point.amount, 0)).toBe(30);
      expect(dashboard.products.rows).toEqual([
        expect.objectContaining({ productKey: "starterContent", unitsSold: 2, orderCount: 2, grossRevenue: 30, currency: "EUR" }),
      ]);
      expect(dashboard.orders.rows).toHaveLength(4);
      expect(dashboard.orderTrends.map((trend) => trend.total)).toEqual([4, 4, 4]);
    }
  });
});
