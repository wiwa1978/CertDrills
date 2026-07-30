import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/observability/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { createBillingReconciliationService } from "../../../src/modules/billing/reconciliation";

function createDb(rows: {
  subscriptionPayments?: Record<string, unknown>;
  creditPurchases?: Record<string, unknown>;
  userSubscriptions?: Record<string, unknown>;
} = {}) {
  return {
    query: {
      subscriptionPayments: {
        findFirst: vi.fn().mockImplementation(() => Promise.resolve(rows.subscriptionPayments ?? null)),
      },
      creditPurchases: {
        findFirst: vi.fn().mockImplementation(() => Promise.resolve(rows.creditPurchases ?? null)),
      },
      userSubscriptions: {
        findFirst: vi.fn().mockImplementation(() => Promise.resolve(rows.userSubscriptions ?? null)),
      },
    },
  };
}

function createProvider(overrides: Record<string, unknown> = {}) {
  return {
    name: "dodo" as const,
    capabilities: { checkout: true, customerPortal: false, invoices: false, refunds: false, finance: true },
    createCheckoutUrl: vi.fn(),
    finance: {
      listPayments: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      listSubscriptions: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    },
    ...overrides,
  };
}

describe("billing reconciliation", () => {
  it("reports provider payments that are missing locally", async () => {
    const paymentProvider = createProvider({
      finance: {
        listPayments: vi.fn().mockResolvedValue({ items: [{ paymentId: "pay_1", status: "succeeded" }], nextCursor: null }),
        listSubscriptions: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      },
    });
    const service = createBillingReconciliationService({ db: createDb(), paymentProvider });

    const result = await service.reconcileProviderBillingState();

    expect(result.issues).toEqual([
      expect.objectContaining({
        type: "missing_local_payment",
        provider: "dodo",
        resourceId: "pay_1",
      }),
    ]);
  });

  it("reports payment and subscription status drift", async () => {
    const paymentProvider = createProvider({
      finance: {
        listPayments: vi.fn().mockResolvedValue({ items: [{ paymentId: "pay_1", status: "succeeded" }], nextCursor: null }),
        listSubscriptions: vi.fn().mockResolvedValue({ items: [{ subscriptionId: "sub_1", status: "cancelled" }], nextCursor: null }),
      },
    });
    const service = createBillingReconciliationService({
      db: createDb({
        subscriptionPayments: { paymentStatus: "pending" },
        userSubscriptions: { status: "active" },
      }),
      paymentProvider,
    });

    const result = await service.reconcileProviderBillingState();

    expect(result.issues).toEqual([
      expect.objectContaining({ type: "payment_status_mismatch", resourceId: "pay_1" }),
      expect.objectContaining({ type: "subscription_status_mismatch", resourceId: "sub_1" }),
    ]);
  });

  it("requires provider finance support", async () => {
    const service = createBillingReconciliationService({
      db: createDb(),
      paymentProvider: createProvider({ finance: undefined, capabilities: { checkout: true, customerPortal: false, invoices: false, refunds: false, finance: false } }),
    });

    await expect(service.reconcileProviderBillingState()).rejects.toThrow("finance support is not configured");
  });
});
