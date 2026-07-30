import { afterEach, describe, expect, it, vi } from "vitest";

import {
  creditPurchases,
  creditTransactions,
  creditUsageEvents,
  user,
  userCredits,
} from "@platform/platform-db";

import { createBillingService } from "../../../src/modules/billing/service";

function updateReturningMock(
  updates: Array<{ table: unknown; set: unknown }>,
  balanceAfter: string,
  options: { noRows?: boolean } = {},
) {
  return vi.fn().mockImplementation((table: unknown) => ({
    set: vi.fn((set: unknown) => {
      updates.push({ table, set });
      return {
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(options.noRows ? [] : [{ balanceAfter }]),
        }),
      };
    }),
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createBillingService", () => {
  // Verifies credit rows are lazily initialized for users without a prior balance record.
  it("initializes user credits when missing", async () => {
    const findFirst = vi.fn().mockResolvedValueOnce(null);
    const insertValues = vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ userId: "u1", balance: "0", totalPurchased: "0", totalSpent: "0" }]),
      }),
    });

    const service = createBillingService({
      db: {
        query: { userCredits: { findFirst } },
        insert: vi.fn().mockImplementation((table: unknown) => {
          if (table !== userCredits) {
            throw new Error("unexpected table insert");
          }
          return { values: insertValues };
        }),
      },
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications: { createNotification: vi.fn() },
    } as any);

    const result = await service.getCreditBalance("u1");

    expect(findFirst).toHaveBeenCalledOnce();
    expect(insertValues).toHaveBeenCalledWith({
      userId: "u1",
      balance: "0",
      totalPurchased: "0",
      totalSpent: "0",
    });
    expect(result).toMatchObject({ userId: "u1", balance: "0" });
  });

  // Verifies concurrent initializers do not fail when another request wins the unique-key race.
  it("returns the existing credits row when insert conflicts", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ userId: "u1", balance: "0", totalPurchased: "0", totalSpent: "0" });

    const onConflictDoNothing = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([]),
    });

    const insertValues = vi.fn().mockReturnValue({
      onConflictDoNothing,
    });

    const service = createBillingService({
      db: {
        query: { userCredits: { findFirst } },
        insert: vi.fn().mockImplementation((table: unknown) => {
          if (table !== userCredits) {
            throw new Error("unexpected table insert");
          }
          return { values: insertValues };
        }),
      },
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications: { createNotification: vi.fn() },
    } as any);

    const result = await service.getCreditBalance("u1");

    expect(onConflictDoNothing).toHaveBeenCalledWith({ target: userCredits.userId });
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ userId: "u1", balance: "0" });
  });

  // Verifies successful purchases atomically update purchases, balances, ledger entries, and notifications.
  it("processes completed purchase and writes ledger + notification", async () => {
    const notifications = { createNotification: vi.fn().mockResolvedValue(undefined) };
    const inserts: Array<{ table: unknown; values: unknown }> = [];
    const updates: Array<{ table: unknown; set: unknown }> = [];

    const tx = {
      query: {
        creditPurchases: {
          findFirst: vi.fn().mockResolvedValueOnce(null),
        },
        userCredits: {
          findFirst: vi.fn().mockResolvedValueOnce({ userId: "u1", balance: "100", totalPurchased: "100", totalSpent: "0" }),
        },
      },
      insert: vi.fn().mockImplementation((table: unknown) => ({
        values: vi.fn((values: unknown) => {
          inserts.push({ table, values });
          if (table === creditPurchases) {
            return {
              returning: vi.fn().mockResolvedValue([
                {
                  id: "purchase-1",
                  userId: "u1",
                  packageKey: "advanced",
                  paymentStatus: "completed",
                },
              ]),
            };
          }
          return Promise.resolve(undefined);
        }),
      })),
      update: updateReturningMock(updates, "210"),
    };

    const db = {
      transaction: vi.fn(async (cb: (trx: any) => unknown) => cb(tx)),
    };

    const service = createBillingService({
      db: db as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications,
    });

    const purchase = await service.processCreditPurchase("u1", "advanced", "pay_1", "completed");

    expect(purchase).toMatchObject({ id: "purchase-1", paymentStatus: "completed" });
    expect(inserts[0]?.values).toMatchObject({ paymentStatus: "completed" });
    expect((inserts[0]?.values as { creditsGrantedAt?: unknown }).creditsGrantedAt).toBeInstanceOf(Date);
    expect(inserts[0]?.values).toMatchObject({
      paymentSnapshot: {
        provider: "dodo",
        packageKey: "advanced",
        priceExclVat: 2500,
        priceInclVat: 2500,
        vatAmount: 0,
        currency: "EUR",
      },
    });
    expect(updates).toHaveLength(1);
    expect(updates[0]?.table).toBe(userCredits);
    expect(notifications.createNotification).toHaveBeenCalledOnce();

    const transactionInserts = inserts.filter((entry) => entry.table === creditTransactions);
    expect(transactionInserts).toHaveLength(2);
    expect(transactionInserts[0]?.values).toMatchObject({ type: "purchase", userId: "u1", referenceId: "pay_1" });
    expect(transactionInserts[1]?.values).toMatchObject({ type: "bonus", userId: "u1", referenceId: "pay_1" });
  });

  // Verifies pending purchases do not mutate balances or produce side effects.
  it("does not mutate credits for pending purchases", async () => {
    const purchaseValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "purchase-pending", paymentStatus: "pending" }]),
    });

    const tx = {
      query: {
        creditPurchases: {
          findFirst: vi.fn().mockResolvedValueOnce(null),
        },
        userCredits: {
          findFirst: vi.fn(),
        },
      },
      insert: vi.fn().mockImplementation((table: unknown) => ({
        values: table === creditPurchases ? purchaseValues : vi.fn().mockResolvedValue(undefined),
      })),
      update: vi.fn(),
    };

    const notifications = { createNotification: vi.fn() };

    const service = createBillingService({
      db: {
        transaction: vi.fn(async (cb: (trx: any) => unknown) => cb(tx)),
      } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications,
    });

    const purchase = await service.processCreditPurchase("u1", "advanced", "pay_2", "pending");

    expect(purchase).toMatchObject({ id: "purchase-pending", paymentStatus: "pending" });
    expect(purchaseValues).toHaveBeenCalledWith(expect.objectContaining({ creditsGrantedAt: null }));
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.query.userCredits.findFirst).not.toHaveBeenCalled();
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  // Verifies provider/customer/pricing snapshots are stored for accounting and support.
  it("stores payment snapshots from provider data", async () => {
    const purchaseValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "purchase-snapshot", paymentStatus: "pending" }]),
    });

    const tx = {
      query: {
        creditPurchases: {
          findFirst: vi.fn().mockResolvedValueOnce(null),
        },
        userCredits: {
          findFirst: vi.fn(),
        },
      },
      insert: vi.fn().mockImplementation((table: unknown) => ({
        values: table === creditPurchases ? purchaseValues : vi.fn().mockResolvedValue(undefined),
      })),
      update: vi.fn(),
    };

    const service = createBillingService({
      db: {
        transaction: vi.fn(async (cb: (trx: any) => unknown) => cb(tx)),
      } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications: { createNotification: vi.fn() },
    });

    await service.processCreditPurchase(
      "u1",
      "advanced",
      "pay_snapshot",
      "pending",
      "cus_snapshot",
      {
        priceExclVat: 4000,
        priceInclVat: 5000,
        vatAmount: 1000,
        currency: "EUR",
      },
      {
        provider: "dodo",
        customerId: "cus_snapshot",
      },
    );

    expect(purchaseValues).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentSnapshot: {
          provider: "dodo",
          customerId: "cus_snapshot",
          packageKey: "advanced",
          priceExclVat: 4000,
          priceInclVat: 5000,
          vatAmount: 1000,
          currency: "EUR",
        },
      }),
    );
  });

  // Verifies repeated payment events with the same paymentId are safely deduplicated.
  it("is idempotent for same paymentId and does not double-credit", async () => {
    const alreadyGrantedAt = new Date("2026-01-01T00:00:00Z");
    const tx = {
      query: {
        creditPurchases: {
          findFirst: vi.fn().mockResolvedValueOnce({
            id: "existing-purchase",
            userId: "u1",
            paymentId: "pay_dup",
            paymentStatus: "completed",
            creditsGrantedAt: alreadyGrantedAt,
          }),
        },
        userCredits: {
          findFirst: vi.fn(),
        },
      },
      insert: vi.fn(),
      update: vi.fn(),
    };

    const notifications = { createNotification: vi.fn() };
    const service = createBillingService({
      db: {
        transaction: vi.fn(async (cb: (trx: any) => unknown) => cb(tx)),
      } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications,
    });

    const result = await service.processCreditPurchase("u1", "advanced", "pay_dup", "completed");

    expect(result).toMatchObject({ id: "existing-purchase", paymentId: "pay_dup", creditsGrantedAt: alreadyGrantedAt });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.query.userCredits.findFirst).not.toHaveBeenCalled();
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  // Verifies later failed events cannot downgrade a purchase that already granted credits.
  it("does not mark credited completed purchases as failed", async () => {
    const alreadyGrantedAt = new Date("2026-01-01T00:00:00Z");
    const existingPurchase = {
      id: "existing-completed",
      userId: "u1",
      paymentId: "pay_completed",
      paymentStatus: "completed",
      creditsGrantedAt: alreadyGrantedAt,
    };
    const tx = {
      query: {
        creditPurchases: {
          findFirst: vi.fn().mockResolvedValueOnce(existingPurchase),
        },
        userCredits: {
          findFirst: vi.fn(),
        },
      },
      insert: vi.fn(),
      update: vi.fn(),
    };

    const notifications = { createNotification: vi.fn() };
    const service = createBillingService({
      db: {
        transaction: vi.fn(async (cb: (trx: any) => unknown) => cb(tx)),
      } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications,
    });

    const result = await service.processCreditPurchase("u1", "advanced", "pay_completed", "failed");

    expect(result).toBe(existingPurchase);
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.query.userCredits.findFirst).not.toHaveBeenCalled();
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  // Verifies a pending purchase receives credits on its first completed transition only.
  it("grants credits once when an existing pending purchase completes", async () => {
    const notifications = { createNotification: vi.fn().mockResolvedValue(undefined) };
    const inserts: Array<{ table: unknown; values: unknown }> = [];
    const updates: Array<{ table: unknown; set: unknown }> = [];

    const tx = {
      query: {
        creditPurchases: {
          findFirst: vi.fn().mockResolvedValueOnce({
            id: "existing-pending",
            userId: "u1",
            paymentId: "pay_pending",
            paymentStatus: "pending",
            dodoCustomerId: null,
            creditsGrantedAt: null,
          }),
        },
        userCredits: {
          findFirst: vi.fn().mockResolvedValueOnce({ userId: "u1", balance: "10", totalPurchased: "20", totalSpent: "0" }),
        },
      },
      insert: vi.fn().mockImplementation((table: unknown) => ({
        values: vi.fn((values: unknown) => {
          inserts.push({ table, values });
          return Promise.resolve(undefined);
        }),
      })),
      update: updateReturningMock(updates, "120"),
    };

    const service = createBillingService({
      db: {
        transaction: vi.fn(async (cb: (trx: any) => unknown) => cb(tx)),
      } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications,
    });

    const result = await service.processCreditPurchase("u1", "advanced", "pay_pending", "completed");

    expect(result).toMatchObject({ id: "existing-pending", paymentStatus: "completed" });
    expect(result.creditsGrantedAt).toBeInstanceOf(Date);
    expect(updates).toHaveLength(2);
    expect(updates[0]?.table).toBe(creditPurchases);
    expect(updates[0]?.set).toMatchObject({ paymentStatus: "completed" });
    expect((updates[0]?.set as { creditsGrantedAt?: unknown }).creditsGrantedAt).toBeInstanceOf(Date);
    expect(updates[1]?.table).toBe(userCredits);

    const transactionInserts = inserts.filter((entry) => entry.table === creditTransactions);
    expect(transactionInserts).toHaveLength(2);
    expect(notifications.createNotification).toHaveBeenCalledOnce();
  });

  // Verifies full refunds reverse granted credits once and mark the purchase refunded.
  it("reverses credits once for refunded completed purchases", async () => {
    const inserts: Array<{ table: unknown; values: unknown }> = [];
    const updates: Array<{ table: unknown; set: unknown }> = [];
    const tx = {
      query: {
        creditPurchases: {
          findFirst: vi.fn().mockResolvedValueOnce({
            id: "purchase-refund",
            userId: "u1",
            packageKey: "advanced",
            paymentId: "pay_refund",
            paymentStatus: "completed",
            credits: 100,
            bonusCredits: 10,
            creditsGrantedAt: new Date("2026-01-01T00:00:00Z"),
          }),
        },
        userCredits: {
          findFirst: vi.fn().mockResolvedValueOnce({ userId: "u1", balance: "150", totalPurchased: "100", totalSpent: "0" }),
        },
      },
      insert: vi.fn().mockImplementation((table: unknown) => ({
        values: vi.fn((values: unknown) => {
          inserts.push({ table, values });
          if (table === creditTransactions) {
            return { returning: vi.fn().mockResolvedValue([{ id: "tx-refund-1" }]) };
          }
          return Promise.resolve(undefined);
        }),
      })),
      update: updateReturningMock(updates, "40"),
    };

    const service = createBillingService({
      db: {
        transaction: vi.fn(async (cb: (trx: any) => unknown) => cb(tx)),
      } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications: { createNotification: vi.fn() },
    });

    const result = await service.processCreditRefund("pay_refund", "rfnd_123");

    expect(result).toMatchObject({ id: "purchase-refund", paymentStatus: "refunded" });
    expect(updates).toHaveLength(2);
    expect(updates[0]?.table).toBe(userCredits);
    expect((updates[0]?.set as { balance?: unknown }).balance).toBeDefined();
    expect(updates[1]?.table).toBe(creditPurchases);
    expect(updates[1]?.set).toMatchObject({ paymentStatus: "refunded" });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.table).toBe(creditTransactions);
    expect(inserts[0]?.values).toMatchObject({
      userId: "u1",
      type: "refund",
      amount: "-110.00",
      referenceType: "payment",
      referenceId: "pay_refund",
      balanceAfter: "40.00",
      metadata: { refundId: "rfnd_123" },
    });
  });

  // Verifies repeated refund events do not create duplicate reversal transactions.
  it("is idempotent for already refunded purchases", async () => {
    const existingPurchase = {
      id: "purchase-refunded",
      userId: "u1",
      packageKey: "advanced",
      paymentId: "pay_refunded",
      paymentStatus: "refunded",
      credits: 100,
      bonusCredits: 10,
      creditsGrantedAt: new Date("2026-01-01T00:00:00Z"),
    };
    const tx = {
      query: {
        creditPurchases: {
          findFirst: vi.fn().mockResolvedValueOnce(existingPurchase),
        },
        userCredits: {
          findFirst: vi.fn(),
        },
      },
      insert: vi.fn(),
      update: vi.fn(),
    };

    const service = createBillingService({
      db: {
        transaction: vi.fn(async (cb: (trx: any) => unknown) => cb(tx)),
      } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications: { createNotification: vi.fn() },
    });

    const result = await service.processCreditRefund("pay_refunded", "rfnd_123");

    expect(result).toBe(existingPurchase);
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.query.userCredits.findFirst).not.toHaveBeenCalled();
  });

  // Verifies dispute losses reverse granted credits and mark the purchase failed.
  it("reverses credits once for lost disputes", async () => {
    const inserts: Array<{ table: unknown; values: unknown }> = [];
    const updates: Array<{ table: unknown; set: unknown }> = [];
    const tx = {
      query: {
        creditPurchases: {
          findFirst: vi.fn().mockResolvedValueOnce({
            id: "purchase-dispute",
            userId: "u1",
            packageKey: "advanced",
            paymentId: "pay_dispute",
            paymentStatus: "completed",
            credits: 100,
            bonusCredits: 10,
            creditsGrantedAt: new Date("2026-01-01T00:00:00Z"),
          }),
        },
        userCredits: {
          findFirst: vi.fn().mockResolvedValueOnce({ userId: "u1", balance: "150", totalPurchased: "100", totalSpent: "0" }),
        },
      },
      insert: vi.fn().mockImplementation((table: unknown) => ({
        values: vi.fn((values: unknown) => {
          inserts.push({ table, values });
          if (table === creditTransactions) {
            return { returning: vi.fn().mockResolvedValue([{ id: "tx-dispute-1" }]) };
          }
          return Promise.resolve(undefined);
        }),
      })),
      update: updateReturningMock(updates, "40"),
    };

    const service = createBillingService({
      db: {
        transaction: vi.fn(async (cb: (trx: any) => unknown) => cb(tx)),
      } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications: { createNotification: vi.fn() },
    });

    const result = await service.processCreditDisputeLoss("pay_dispute", "disp_123", "dispute_lost");

    expect(result).toMatchObject({ id: "purchase-dispute", paymentStatus: "failed" });
    expect(updates).toHaveLength(2);
    expect(updates[0]?.table).toBe(userCredits);
    expect((updates[0]?.set as { balance?: unknown }).balance).toBeDefined();
    expect(updates[1]?.table).toBe(creditPurchases);
    expect(updates[1]?.set).toMatchObject({ paymentStatus: "failed" });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.table).toBe(creditTransactions);
    expect(inserts[0]?.values).toMatchObject({
      userId: "u1",
      type: "admin_adjustment",
      amount: "-110.00",
      description: "Dispute reversal: Advanced",
      referenceType: "payment",
      referenceId: "pay_dispute",
      balanceAfter: "40.00",
      metadata: { disputeId: "disp_123", disputeStatus: "dispute_lost" },
    });
  });

  // Verifies invalid package keys fail fast before any persistence call.
  it("throws for unknown package key", async () => {
    const service = createBillingService({
      db: { transaction: vi.fn() } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications: { createNotification: vi.fn() },
    });

    await expect(service.processCreditPurchase("u1", "invalid", "pay_3", "completed")).rejects.toThrow(
      "Credit package not found: invalid",
    );
  });

  // Verifies email lookup returns the first matching user identity.
  it("returns first matched user by email", async () => {
    const rows = [{ id: "u1" }];
    const service = createBillingService({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(rows),
            }),
          }),
        }),
      } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications: { createNotification: vi.fn() },
    });

    const result = await service.getUserByEmail("john@example.com");
    expect(result).toEqual({ id: "u1" });
  });

  // Verifies invoice download succeeds when ownership and payment state are valid.
  it("downloads invoice successfully", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ invoice_pdf: "https://invoices.test/file.pdf" }),
      }),
    );

    const service = createBillingService({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: "cp_1",
                  userId: "u1",
                  paymentStatus: "completed",
                },
              ]),
            }),
          }),
        }),
      } as any,
      paymentProvider: {
        name: "dodo",
        capabilities: { checkout: true, customerPortal: false, invoices: true, refunds: false, finance: false },
        createCheckoutUrl: vi.fn(),
        getInvoice: vi.fn(async () => ({ invoiceUrl: "https://invoices.test/file.pdf" })),
      },
      notifications: { createNotification: vi.fn() },
    });

    const result = await service.downloadInvoice("u1", "pay_1");
    expect(result.success).toBe(true);
    expect(result.invoiceUrl).toBe("https://invoices.test/file.pdf");
    expect(result).not.toHaveProperty("invoiceData");
  });

  // Verifies provider failures are sanitized before surfacing to callers.
  it("sanitizes invoice provider failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue("provider exploded"),
      }),
    );

    const service = createBillingService({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: "cp_1",
                  userId: "u1",
                  paymentStatus: "completed",
                },
              ]),
            }),
          }),
        }),
      } as any,
      paymentProvider: {
        name: "dodo",
        capabilities: { checkout: true, customerPortal: false, invoices: true, refunds: false, finance: false },
        createCheckoutUrl: vi.fn(),
        getInvoice: vi.fn(async () => {
          throw new Error("Invoice provider request failed");
        }),
      },
      notifications: { createNotification: vi.fn() },
    });

    await expect(service.downloadInvoice("u1", "pay_1")).rejects.toThrow("Invoice provider request failed");
  });

  // Verifies provider timeout details are sanitized before surfacing to callers.
  it("sanitizes invoice provider timeouts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation timed out", "TimeoutError")),
    );

    const service = createBillingService({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: "cp_1",
                  userId: "u1",
                  paymentStatus: "completed",
                },
              ]),
            }),
          }),
        }),
      } as any,
      paymentProvider: {
        name: "dodo",
        capabilities: { checkout: true, customerPortal: false, invoices: true, refunds: false, finance: false },
        createCheckoutUrl: vi.fn(),
        getInvoice: vi.fn(async () => {
          throw new Error("Invoice provider request timed out");
        }),
      },
      notifications: { createNotification: vi.fn() },
    });

    await expect(service.downloadInvoice("u1", "pay_1")).rejects.toThrow("Invoice provider request timed out");
  });

  // Verifies invoice download is blocked for non-owner users.
  it("rejects invoice download for wrong owner", async () => {
    const service = createBillingService({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: "cp_1",
                  userId: "someone-else",
                  paymentStatus: "completed",
                },
              ]),
            }),
          }),
        }),
      } as any,
      paymentProvider: {
        name: "dodo",
        capabilities: { checkout: true, customerPortal: false, invoices: true, refunds: false, finance: false },
        createCheckoutUrl: vi.fn(),
        getInvoice: vi.fn(),
      },
      notifications: { createNotification: vi.fn() },
    });

    await expect(service.downloadInvoice("u1", "pay_1")).rejects.toThrow("Unauthorized");
  });

  // Verifies credit history and purchase queries respect explicit limits.
  it("returns credit history and purchases with limit", async () => {
    const select = vi.fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: "t1" }]),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: "p1" }]),
            }),
          }),
        }),
      });

    const service = createBillingService({
      db: { select } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications: { createNotification: vi.fn() },
    });

    const [history, purchases] = await Promise.all([
      service.getCreditHistory("u1", 5),
      service.getCreditPurchases("u1", 5),
    ]);

    expect(history).toEqual([{ id: "t1" }]);
    expect(purchases).toEqual([{ id: "p1" }]);
  });

  // Verifies credit history limits are clamped to a safe upper bound.
  it("clamps oversized history and purchase limits", async () => {
    const historyLimit = vi.fn().mockResolvedValue([]);
    const purchaseLimit = vi.fn().mockResolvedValue([]);

    const select = vi.fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: historyLimit,
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: purchaseLimit,
            }),
          }),
        }),
      });

    const service = createBillingService({
      db: { select } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications: { createNotification: vi.fn() },
    });

    await Promise.all([
      service.getCreditHistory("u1", 999),
      service.getCreditPurchases("u1", Number.NaN),
    ]);

    expect(historyLimit).toHaveBeenCalledWith(100);
    expect(purchaseLimit).toHaveBeenCalledWith(50);
  });

  // Verifies consumeCredits deducts credits and records a usage event atomically.
  it("consumeCredits deducts credits and inserts usage event", async () => {
    const inserts: Array<{ table: unknown; values: unknown }> = [];
    const updates: Array<{ table: unknown; set: unknown }> = [];

    const tx = {
      query: {
        creditUsageEvents: {
          findFirst: vi.fn().mockResolvedValueOnce(null),
        },
        userCredits: {
          findFirst: vi.fn().mockResolvedValueOnce({ userId: "u1", balance: "100", totalPurchased: "100", totalSpent: "10" }),
        },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      insert: vi.fn().mockImplementation((table: unknown) => ({
        values: vi.fn((values: unknown) => {
          inserts.push({ table, values });
          if (table === creditTransactions) {
            return { returning: vi.fn().mockResolvedValue([{ id: "tx-usage-1" }]) };
          }
          return Promise.resolve(undefined);
        }),
      })),
      update: updateReturningMock(updates, "95"),
    };

    const service = createBillingService({
      db: { transaction: vi.fn(async (cb: (trx: any) => unknown) => cb(tx)) } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications: { createNotification: vi.fn() },
    });

    const result = await service.consumeCredits("u1", {
      featureKey: "ai-query",
      amount: 5,
      idempotencyKey: "idem-key-12345678",
    });

    expect(result).toMatchObject({
      transactionId: "tx-usage-1",
      idempotencyKey: "idem-key-12345678",
      balanceBefore: "100.00",
      balanceAfter: "95.00",
      alreadyProcessed: false,
    });
    expect(updates).toHaveLength(1);
    expect(updates[0]?.table).toBe(userCredits);
    expect((updates[0]?.set as { balance?: unknown }).balance).toBeDefined();
    const txInsert = inserts.find((i) => i.table === creditTransactions);
    expect(txInsert?.values).toMatchObject({
      userId: "u1",
      type: "usage",
      amount: "-5.00",
      referenceType: "feature_usage",
      referenceId: "idem-key-12345678",
      balanceAfter: "95.00",
    });
    const usageInsert = inserts.find((i) => i.table === creditUsageEvents);
    expect(usageInsert?.values).toMatchObject({
      userId: "u1",
      featureKey: "ai-query",
      idempotencyKey: "idem-key-12345678",
      amount: "5.00",
      transactionId: "tx-usage-1",
    });
  });

  // Verifies consumeCredits is idempotent when the same idempotency key is repeated.
  it("consumeCredits returns cached result for duplicate idempotency key", async () => {
    const existingEvent = {
      transactionId: "tx-existing-1",
      idempotencyKey: "idem-key-12345678",
      amount: "5.00",
    };

    const tx = {
      query: {
        creditUsageEvents: {
          findFirst: vi.fn().mockResolvedValueOnce(existingEvent),
        },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ balanceAfter: "95.00" }]),
          }),
        }),
      }),
      insert: vi.fn(),
      update: updateReturningMock([], "0", { noRows: true }),
    };

    const service = createBillingService({
      db: { transaction: vi.fn(async (cb: (trx: any) => unknown) => cb(tx)) } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications: { createNotification: vi.fn() },
    });

    const result = await service.consumeCredits("u1", {
      featureKey: "ai-query",
      amount: 5,
      idempotencyKey: "idem-key-12345678",
    });

    expect(result).toMatchObject({
      transactionId: "tx-existing-1",
      idempotencyKey: "idem-key-12345678",
      balanceBefore: "100.00",
      balanceAfter: "95.00",
      alreadyProcessed: true,
    });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  // Verifies consumeCredits rejects when user has insufficient credits.
  it("consumeCredits throws on insufficient credits", async () => {
    const tx = {
      query: {
        creditUsageEvents: {
          findFirst: vi.fn().mockResolvedValueOnce(null),
        },
        userCredits: {
          findFirst: vi.fn().mockResolvedValueOnce({ userId: "u1", balance: "3", totalPurchased: "10", totalSpent: "7" }),
        },
      },
      select: vi.fn(),
      insert: vi.fn(),
      update: updateReturningMock([], "0", { noRows: true }),
    };

    const service = createBillingService({
      db: { transaction: vi.fn(async (cb: (trx: any) => unknown) => cb(tx)) } as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications: { createNotification: vi.fn() },
    });

    await expect(
      service.consumeCredits("u1", {
        featureKey: "ai-query",
        amount: 10,
        idempotencyKey: "idem-key-12345678",
      }),
    ).rejects.toThrow("Insufficient credits");
    expect(tx.insert).not.toHaveBeenCalled();
  });

  // Verifies applyAdminCreditAdjustment adjusts the balance and optionally notifies.
  it("applyAdminCreditAdjustment adjusts credits with admin type", async () => {
    const inserts: Array<{ table: unknown; values: unknown }> = [];
    const updates: Array<{ table: unknown; set: unknown }> = [];
    const notifications = { createNotification: vi.fn().mockResolvedValue(undefined) };

    const db = {
      query: {
        userCredits: {
          findFirst: vi.fn().mockResolvedValueOnce({ userId: "u1", balance: "50", totalPurchased: "50", totalSpent: "0" }),
        },
      },
      insert: vi.fn().mockImplementation((table: unknown) => ({
        values: vi.fn((values: unknown) => {
          inserts.push({ table, values });
          if (table === creditTransactions) {
            return { returning: vi.fn().mockResolvedValue([{ id: "tx-admin-1" }]) };
          }
          return Promise.resolve(undefined);
        }),
      })),
      update: updateReturningMock(updates, "75"),
    };

    const service = createBillingService({
      db: db as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications,
    });

    const result = await service.applyAdminCreditAdjustment("u1", {
      amount: 25,
      reason: "Compensation for downtime",
      notifyUser: true,
    });

    expect(result).toMatchObject({
      transactionId: "tx-admin-1",
      balanceBefore: "50.00",
      balanceAfter: "75.00",
    });
    const txInsert = inserts.find((i) => i.table === creditTransactions);
    expect(txInsert?.values).toMatchObject({
      userId: "u1",
      type: "admin_adjustment",
      amount: "25.00",
      referenceType: "admin",
      balanceAfter: "75.00",
    });
    await vi.waitFor(() => expect(notifications.createNotification).toHaveBeenCalledOnce());
  });
});
