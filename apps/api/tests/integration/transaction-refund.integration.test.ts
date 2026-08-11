import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import {
  transactionEntitlements,
  transactionOrderItems,
  transactionOrders,
  user,
} from "@platform/platform-db";

import { createTransactionService } from "../../src/modules/billing/transaction-service";
import type { PaymentProvider } from "../../src/modules/payments/provider";
import { createFixtureUser, fixtureToken, openTestDatabase } from "../support/database";

let database: ReturnType<typeof openTestDatabase>;
const fixtureUserIds = new Set<string>();

function provider(createRefund: NonNullable<PaymentProvider["createRefund"]>): PaymentProvider {
  return {
    name: "integration",
    capabilities: {
      checkout: true,
      customerPortal: false,
      invoices: false,
      refunds: true,
      discounts: false,
      finance: {
        payments: false,
        subscriptions: false,
        refunds: false,
        ledger: false,
        discounts: false,
        products: false,
        disputes: false,
        payouts: false,
        paymentLineItems: false,
      },
    },
    createCheckoutUrl: () => "https://checkout.example.test",
    createRefund,
  };
}

async function seedRefundableOrder() {
  const owner = await createFixtureUser(database.db, "refund-owner");
  fixtureUserIds.add(owner.id);
  const paymentId = fixtureToken("refund-payment");
  const [order] = await database.db.insert(transactionOrders).values({
    userId: owner.id,
    status: "paid",
    currency: "EUR",
    subtotalAmount: 800,
    taxAmount: 200,
    totalAmount: 1000,
    paymentProvider: "integration",
    paymentId,
    checkoutReferenceId: fixtureToken("refund-checkout"),
    paidAt: new Date(),
    fulfilledAt: new Date(),
  }).returning();
  if (!order) throw new Error("Failed to create refundable order");

  const [item] = await database.db.insert(transactionOrderItems).values({
    orderId: order.id,
    productKey: "starterContent",
    quantity: 1,
    unitPrice: 1000,
    totalAmount: 1000,
    currency: "EUR",
    providerProductId: "provider-basic",
  }).returning();
  if (!item) throw new Error("Failed to create refundable order item");

  const [entitlement] = await database.db.insert(transactionEntitlements).values({
    userId: owner.id,
    orderId: order.id,
    orderItemId: item.id,
    unitIndex: 0,
    productKey: "starterContent",
    status: "available",
    sourcePaymentId: paymentId,
  }).returning();
  if (!entitlement) throw new Error("Failed to create refundable entitlement");

  return { owner, order, entitlement, paymentId };
}

function service(paymentProvider: PaymentProvider) {
  return createTransactionService({
    db: database.db,
    paymentProvider,
    checkoutIntents: {} as never,
  });
}

describe("transaction refund PostgreSQL integration", () => {
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

  it("commits the provider refund and entitlement revocation atomically", async () => {
    const fixture = await seedRefundableOrder();
    const createRefund = vi.fn(async () => ({
      refundId: "refund-integration-1",
      paymentId: fixture.paymentId,
      status: "succeeded",
      amount: 1000,
      currency: "EUR",
    }));

    const result = await service(provider(createRefund)).createTransactionRefund({
      orderId: fixture.order.id,
      reason: "Integration test",
      actorUserId: fixture.owner.id,
    });

    expect(result.order.status).toBe("refunded");
    expect(result.refund.refundId).toBe("refund-integration-1");
    expect(createRefund).toHaveBeenCalledWith(expect.objectContaining({
      paymentId: fixture.paymentId,
      reason: "Integration test",
      idempotencyKey: `transaction-refund:integration:${fixture.paymentId}`,
      metadata: expect.objectContaining({ local_transaction_order_id: fixture.order.id, actor_user_id: fixture.owner.id }),
    }));

    const storedOrder = await database.db.query.transactionOrders.findFirst({ where: eq(transactionOrders.id, fixture.order.id) });
    const storedEntitlement = await database.db.query.transactionEntitlements.findFirst({ where: eq(transactionEntitlements.id, fixture.entitlement.id) });
    expect(storedOrder?.status).toBe("refunded");
    expect(storedEntitlement?.status).toBe("refunded");
    expect(storedEntitlement?.refundedAt).toBeInstanceOf(Date);
  });

  it("restores the order and entitlements when the provider fails", async () => {
    const fixture = await seedRefundableOrder();
    const createRefund = vi.fn(async () => {
      throw new Error("provider unavailable");
    });

    await expect(service(provider(createRefund)).createTransactionRefund({ orderId: fixture.order.id }))
      .rejects.toThrow("provider unavailable");

    const storedOrder = await database.db.query.transactionOrders.findFirst({ where: eq(transactionOrders.id, fixture.order.id) });
    const storedEntitlement = await database.db.query.transactionEntitlements.findFirst({ where: eq(transactionEntitlements.id, fixture.entitlement.id) });
    expect(storedOrder?.status).toBe("paid");
    expect(storedEntitlement?.status).toBe("available");
    expect(storedEntitlement?.refundedAt).toBeNull();
  });

  it("rejects consumed entitlements before contacting the provider", async () => {
    const fixture = await seedRefundableOrder();
    await database.db.update(transactionEntitlements).set({ status: "consumed", consumedAt: new Date() })
      .where(eq(transactionEntitlements.id, fixture.entitlement.id));
    const createRefund = vi.fn(async () => ({
      refundId: "should-not-run",
      paymentId: fixture.paymentId,
      status: "succeeded",
    }));

    await expect(service(provider(createRefund)).createTransactionRefund({ orderId: fixture.order.id }))
      .rejects.toThrow("Orders with consumed entitlements cannot be refunded");
    expect(createRefund).not.toHaveBeenCalled();
  });
});
