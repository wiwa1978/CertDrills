import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createBillingReconciliationService } from "../../../src/modules/billing/reconciliation";

function query(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.then = (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

function createDb(results: unknown[][] = []) {
  let index = 0;
  return { select: vi.fn(() => query(results[index++] ?? [])) };
}

function createProvider(overrides: Record<string, unknown> = {}) {
  return {
    name: "dodo" as const,
    capabilities: { checkout: true, customerPortal: false, invoices: false, refunds: false, discounts: false, finance: {} },
    createCheckoutUrl: vi.fn(),
    finance: {
      listPayments: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      listSubscriptions: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      ...overrides,
    },
  } as never;
}

describe("billing reconciliation", () => {
  it("paginates provider inventories and reports provider-only payments", async () => {
    const listPayments = vi.fn()
      .mockResolvedValueOnce({ items: [{ paymentId: "pay-1", status: "completed" }], nextCursor: "next" })
      .mockResolvedValueOnce({ items: [{ paymentId: "pay-2", status: "completed" }], nextCursor: null });
    const service = createBillingReconciliationService({
      db: createDb() as never,
      paymentProvider: createProvider({ listPayments }),
    });

    const result = await service.reconcileProviderBillingState();

    expect(listPayments).toHaveBeenCalledTimes(2);
    expect(result.counts.providerPayments).toBe(2);
    expect(result.issues).toEqual([
      expect.objectContaining({ type: "missing_local_payment", resourceId: "pay-1" }),
      expect.objectContaining({ type: "missing_local_payment", resourceId: "pay-2" }),
    ]);
  });

  it("batches credit, subscription, transaction, and subscription drift checks", async () => {
    const db = createDb([
      [{ paymentId: "local-only", status: "completed" }],
      [],
      [],
      [{ providerSubscriptionId: "sub-1", dodoSubscriptionId: null, status: "active" }],
      [{ paymentId: "pay-1", status: "pending" }],
      [],
      [],
      [{ providerSubscriptionId: "sub-1", dodoSubscriptionId: null, status: "active" }],
    ]);
    const service = createBillingReconciliationService({
      db: db as never,
      paymentProvider: createProvider({
        listPayments: vi.fn().mockResolvedValue({ items: [{ paymentId: "pay-1", status: "completed" }], nextCursor: null }),
        listSubscriptions: vi.fn().mockResolvedValue({ items: [{ subscriptionId: "sub-1", status: "cancelled" }], nextCursor: null }),
      }),
    });

    const result = await service.reconcileProviderBillingState();

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "payment_status_mismatch", resourceId: "pay-1", localResourceType: "credit_purchase" }),
      expect.objectContaining({ type: "missing_provider_payment", resourceId: "local-only" }),
      expect.objectContaining({ type: "subscription_status_mismatch", resourceId: "sub-1" }),
    ]));
  });

  it("requires provider finance support", async () => {
    const service = createBillingReconciliationService({
      db: createDb() as never,
      paymentProvider: createProvider({ listPayments: undefined }),
    });

    await expect(service.reconcileProviderBillingState()).rejects.toThrow("finance support is not configured");
  });
});
