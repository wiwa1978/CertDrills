import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { transactionOrders, user } from "@platform/platform-db";

import { createBillingReconciliationService } from "../../src/modules/billing/reconciliation";
import type { PaymentProvider, ProviderPaymentListItem } from "../../src/modules/payments/provider";
import { createFixtureUser, fixtureToken, openTestDatabase } from "../support/database";

vi.mock("../../src/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let database: ReturnType<typeof openTestDatabase>;
const fixtureUserIds = new Set<string>();

function payment(paymentId: string, status: string): ProviderPaymentListItem {
  return {
    provider: "integration",
    paymentId,
    subscriptionId: null,
    customer: null,
    status,
    amount: { amount: 1000, currency: "EUR" },
    createdAt: new Date().toISOString(),
    invoiceUrl: null,
    refundStatus: null,
    disputeStatus: null,
    paymentMethod: null,
    paymentMethodType: null,
    errorCode: null,
    errorMessage: null,
  };
}

function provider(payments: ProviderPaymentListItem[]): PaymentProvider {
  return {
    name: "integration",
    capabilities: {
      checkout: false,
      customerPortal: false,
      invoices: false,
      refunds: false,
      discounts: false,
      finance: {
        payments: true,
        subscriptions: true,
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
    finance: {
      listPayments: async () => ({ items: payments }),
      listSubscriptions: async () => ({ items: [] }),
    },
  };
}

describe("billing reconciliation PostgreSQL integration", () => {
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

  it("reports provider, local, and status drift from real billing records", async () => {
    const owner = await createFixtureUser(database.db, "reconciliation-owner");
    fixtureUserIds.add(owner.id);
    const matchedPaymentId = fixtureToken("matched-payment");
    const localOnlyPaymentId = fixtureToken("local-only-payment");
    const providerOnlyPaymentId = fixtureToken("provider-only-payment");

    await database.db.insert(transactionOrders).values([
      {
        userId: owner.id,
        status: "paid",
        currency: "EUR",
        subtotalAmount: 800,
        taxAmount: 200,
        totalAmount: 1000,
        paymentProvider: "integration",
        paymentId: matchedPaymentId,
        checkoutReferenceId: fixtureToken("matched-checkout"),
      },
      {
        userId: owner.id,
        status: "failed",
        currency: "EUR",
        subtotalAmount: 800,
        taxAmount: 200,
        totalAmount: 1000,
        paymentProvider: "integration",
        paymentId: localOnlyPaymentId,
        checkoutReferenceId: fixtureToken("local-only-checkout"),
      },
    ]);

    const result = await createBillingReconciliationService({
      db: database.db,
      paymentProvider: provider([
        payment(matchedPaymentId, "refunded"),
        payment(providerOnlyPaymentId, "completed"),
      ]),
    }).reconcileProviderBillingState();

    expect(result.counts).toMatchObject({ providerPayments: 2, localPayments: 2 });
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "payment_status_mismatch", resourceId: matchedPaymentId, localResourceType: "transaction_order" }),
      expect.objectContaining({ type: "missing_local_payment", resourceId: providerOnlyPaymentId }),
      expect.objectContaining({ type: "missing_provider_payment", resourceId: localOnlyPaymentId, localResourceType: "transaction_order" }),
    ]));
  });
});
