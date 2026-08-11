import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

import {
  calculateTransactionBasketTotals,
  createTransactionOrderProductId,
  createTransactionService,
  expandEntitlementUnits,
  isCustomerVisibleTransactionOrderStatus,
  validateProviderCartItems,
} from "../../../src/modules/billing/transaction-service";

function createPaymentProvider(overrides: Record<string, unknown> = {}) {
  return {
    name: "dodo",
    capabilities: {
      checkout: true,
      customerPortal: false,
      invoices: false,
      refunds: false,
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
    createCheckoutUrl: vi.fn(),
    ...overrides,
  };
}

function createCheckoutIntents(overrides: Record<string, unknown> = {}) {
  return {
    create: vi.fn().mockResolvedValue({ id: "intent-1", referenceId: "checkout-ref-1" }),
    findByReferenceId: vi.fn().mockResolvedValue({
      id: "intent-1",
      userId: "user-1",
      billingMode: "transactions",
      productId: "transaction-order:order-1",
      referenceId: "checkout-ref-1",
    }),
    markPending: vi.fn().mockResolvedValue(undefined),
    markCompleted: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createUpdateMock(updates: Array<{ table: unknown; set: unknown }> = [], returningRows: unknown[][] = [[{}]]) {
  let returningCall = 0;
  return vi.fn((table: unknown) => ({
    set: vi.fn((set: unknown) => {
      updates.push({ table, set });
      return {
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockImplementation(() => Promise.resolve(returningRows[returningCall++] ?? returningRows.at(-1) ?? [])),
        }),
      };
    }),
  }));
}

describe("transaction service helpers", () => {
  it("calculates totals and rejects mixed currencies", () => {
    expect(calculateTransactionBasketTotals([
      { productKey: "starterContent", quantity: 2, unitPrice: 500, currency: "EUR" },
      { productKey: "premiumContent", quantity: 1, unitPrice: 1000, currency: "EUR" },
    ])).toEqual({ currency: "EUR", subtotalAmount: 2000, taxAmount: 0, totalAmount: 2000 });

    expect(() => calculateTransactionBasketTotals([
      { productKey: "starterContent", quantity: 1, unitPrice: 500, currency: "EUR" },
      { productKey: "premiumContent", quantity: 1, unitPrice: 1000, currency: "USD" },
    ])).toThrow("Transaction basket cannot contain mixed currencies");
  });

  it("creates stable checkout intent product ids for orders", () => {
    expect(createTransactionOrderProductId("order-1")).toBe("transaction-order:order-1");
  });

  it("expands entitlements by item quantity", () => {
    expect(expandEntitlementUnits({ orderItemId: "item-1", quantity: 3 })).toEqual([
      { orderItemId: "item-1", unitIndex: 0 },
      { orderItemId: "item-1", unitIndex: 1 },
      { orderItemId: "item-1", unitIndex: 2 },
    ]);
  });

  it("validates provider cart items in any order and rejects mismatches", () => {
    expect(() => validateProviderCartItems({
      expected: [
        { providerProductId: "pdt_basic", quantity: 2 },
        { providerProductId: "pdt_advanced", quantity: 1 },
      ],
      received: [
        { productId: "pdt_advanced", quantity: 1 },
        { productId: "pdt_basic", quantity: 2 },
      ],
    })).not.toThrow();

    expect(() => validateProviderCartItems({
      expected: [{ providerProductId: "pdt_basic", quantity: 2 }],
      received: [{ productId: "pdt_basic", quantity: 1 }],
    })).toThrow("provider cart line items mismatch");

    expect(() => validateProviderCartItems({
      expected: [{ providerProductId: "pdt_basic", quantity: 2 }],
      received: [{ productId: "pdt_advanced", quantity: 2 }],
    })).toThrow("provider cart line items mismatch");
  });
});

describe("transaction service checkout and fulfillment", () => {
  it("creates transaction checkout URLs through the payment provider", async () => {
    const createTransactionCheckoutUrl = vi.fn().mockResolvedValue("https://checkout.test/order-1");
    const checkoutIntents = createCheckoutIntents();
    const updates: Array<{ table: unknown; set: unknown }> = [];
    const insert = vi.fn()
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "order-1" }]),
        }),
      })
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "order-item-1",
              productKey: "starterContent",
              quantity: 2,
              unitPrice: 500,
              providerProductId: "pdt_transaction_starter_content",
            },
          ]),
        }),
      });
    const tx = {
      query: {
        transactionBaskets: {
          findFirst: vi.fn().mockResolvedValue({ id: "basket-1", userId: "user-1", status: "draft" }),
        },
        transactionBasketItems: {
          findMany: vi.fn().mockResolvedValue([
            { id: "bi-1", productKey: "starterContent", quantity: 2, unitPrice: 500, currency: "EUR" },
          ]),
        },
      },
      insert,
      update: createUpdateMock(updates),
    };
    const db = {
      transaction: vi.fn(async (callback) => callback(tx)),
      update: createUpdateMock(updates),
    };
    const service = createTransactionService({
      db: db as any,
      paymentProvider: createPaymentProvider({ createTransactionCheckoutUrl }) as any,
      checkoutIntents: checkoutIntents as any,
    });

    await expect(service.checkoutBasket({ userId: "user-1", customerEmail: "alice@example.com" })).resolves.toEqual({
      checkoutUrl: "https://checkout.test/order-1",
      orderId: "order-1",
    });
    expect(checkoutIntents.create).toHaveBeenCalledWith({
      userId: "user-1",
      billingMode: "transactions",
      productId: "transaction-order:order-1",
      metadata: { orderId: "order-1" },
    }, tx);
    expect(createTransactionCheckoutUrl).toHaveBeenCalledWith({
      userId: "user-1",
      orderId: "order-1",
      referenceId: "checkout-ref-1",
      currency: "EUR",
      customerEmail: "alice@example.com",
      billingAddress: null,
      items: [{ productId: "pdt_transaction_starter_content", quantity: 2, amount: 500 }],
    });
    expect(updates.some((entry) => (entry.set as { status?: string }).status === "converted")).toBe(true);
  });

  it("refuses checkout when the draft basket claim loses a race", async () => {
    const createTransactionCheckoutUrl = vi.fn().mockResolvedValue("https://checkout.test/order-1");
    const checkoutIntents = createCheckoutIntents();
    const tx = {
      query: {
        transactionBaskets: {
          findFirst: vi.fn().mockResolvedValue({ id: "basket-1", userId: "user-1", status: "draft" }),
        },
        transactionBasketItems: {
          findMany: vi.fn().mockResolvedValue([
            { id: "bi-1", productKey: "starterContent", quantity: 2, unitPrice: 500, currency: "EUR" },
          ]),
        },
      },
      insert: vi.fn(),
      update: createUpdateMock([], [[]]),
    };
    const service = createTransactionService({
      db: { transaction: vi.fn(async (callback) => callback(tx)) } as any,
      paymentProvider: createPaymentProvider({ createTransactionCheckoutUrl }) as any,
      checkoutIntents: checkoutIntents as any,
    });

    await expect(service.checkoutBasket({ userId: "user-1" })).rejects.toThrow("Transaction basket is no longer draft");
    expect(tx.insert).not.toHaveBeenCalled();
    expect(checkoutIntents.create).not.toHaveBeenCalled();
    expect(createTransactionCheckoutUrl).not.toHaveBeenCalled();
  });

  it("marks checkout failure and restores the basket to draft when provider checkout fails", async () => {
    const createTransactionCheckoutUrl = vi.fn().mockRejectedValue(new Error("provider unavailable"));
    const checkoutIntents = createCheckoutIntents();
    const updates: Array<{ table: unknown; set: unknown }> = [];
    const insert = vi.fn()
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "order-1" }]),
        }),
      })
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "order-item-1",
              productKey: "starterContent",
              quantity: 2,
              unitPrice: 500,
              providerProductId: "pdt_transaction_starter_content",
            },
          ]),
        }),
      });
    const tx = {
      query: {
        transactionBaskets: {
          findFirst: vi.fn().mockResolvedValue({ id: "basket-1", userId: "user-1", status: "draft" }),
        },
        transactionBasketItems: {
          findMany: vi.fn().mockResolvedValue([
            { id: "bi-1", productKey: "starterContent", quantity: 2, unitPrice: 500, currency: "EUR" },
          ]),
        },
      },
      insert,
      update: createUpdateMock(updates),
    };
    const db = {
      transaction: vi.fn(async (callback) => callback(tx)),
      update: createUpdateMock(updates),
    };
    const service = createTransactionService({
      db: db as any,
      paymentProvider: createPaymentProvider({ createTransactionCheckoutUrl }) as any,
      checkoutIntents: checkoutIntents as any,
    });

    await expect(service.checkoutBasket({ userId: "user-1" })).rejects.toThrow("provider unavailable");
    expect(checkoutIntents.markFailed).toHaveBeenCalledWith({ id: "intent-1" });
    expect(updates.some((entry) => (entry.set as { status?: string }).status === "failed")).toBe(true);
    expect(updates.some((entry) => (entry.set as { status?: string }).status === "draft")).toBe(true);
  });

  it("handles concurrent draft basket creation by re-reading after insert conflict", async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "basket-1", userId: "user-1", status: "draft", currency: null });
    const onConflictDoNothing = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([]),
    });
    const service = createTransactionService({
      db: {
        query: {
          transactionBaskets: { findFirst },
          transactionBasketItems: { findMany: vi.fn().mockResolvedValue([]) },
        },
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({ onConflictDoNothing }),
        }),
      } as any,
      paymentProvider: createPaymentProvider() as any,
      checkoutIntents: createCheckoutIntents() as any,
    });

    await expect(service.getOrCreateDraftBasket("user-1")).resolves.toEqual({
      id: "basket-1",
      status: "draft",
      currency: null,
      totalAmount: 0,
      items: [],
    });
    expect(onConflictDoNothing).toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledTimes(3);
  });

  it("returns the in-flight checkout basket instead of creating a competing draft", async () => {
    const createTransactionCheckoutUrl = vi.fn(async () => {
      observedBasket = await service.getOrCreateDraftBasket("user-1");
      throw new Error("provider unavailable");
    });
    const checkoutIntents = createCheckoutIntents();
    const basket = { id: "basket-1", userId: "user-1", status: "draft", currency: null };
    const basketItems = [{ id: "bi-1", productKey: "starterContent", quantity: 2, unitPrice: 500, currency: "EUR" }];
    let observedBasket: unknown;
    let service: ReturnType<typeof createTransactionService>;

    const update = vi.fn(() => ({
      set: vi.fn((set: { status?: string }) => ({
        where: vi.fn().mockImplementation(() => {
          if (set.status === "abandoned" || set.status === "converted" || set.status === "draft") {
            basket.status = set.status;
          }
          return {
            returning: vi.fn(async () => {
              if (set.status === "abandoned" || set.status === "converted" || set.status === "draft") {
                return [{ ...basket }];
              }
              return [{ id: "order-1", status: set.status }];
            }),
          };
        }),
      })),
    }));
    const insert = vi.fn()
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "order-1" }]),
        }),
      })
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "order-item-1",
              productKey: "starterContent",
              quantity: 2,
              unitPrice: 500,
              providerProductId: "pdt_transaction_starter_content",
            },
          ]),
        }),
      });
    const tx = {
      query: {
        transactionBaskets: {
          findFirst: vi.fn().mockResolvedValue(basket),
        },
        transactionBasketItems: {
          findMany: vi.fn().mockResolvedValue(basketItems),
        },
      },
      insert,
      update,
    };
    const rootFindFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockImplementation(async () => (basket.status === "abandoned" ? basket : null));
    const rootInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "basket-2", userId: "user-1", status: "draft", currency: null }]),
        }),
      }),
    });
    const db = {
      query: {
        transactionBaskets: { findFirst: rootFindFirst },
        transactionBasketItems: { findMany: vi.fn().mockResolvedValue(basketItems) },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
      insert: rootInsert,
      update,
    };
    service = createTransactionService({
      db: db as any,
      paymentProvider: createPaymentProvider({ createTransactionCheckoutUrl }) as any,
      checkoutIntents: checkoutIntents as any,
    });

    await expect(service.checkoutBasket({ userId: "user-1" })).rejects.toThrow("provider unavailable");
    expect(rootInsert).not.toHaveBeenCalled();
    expect(observedBasket).toMatchObject({ id: "basket-1", status: "abandoned" });
    expect(basket.status).toBe("draft");
  });

  it("serializes listed orders with contract items and product names", async () => {
    const createdAt = new Date("2026-08-03T00:00:00.000Z");
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "order-1",
        userId: "user-1",
        status: "paid",
        currency: "EUR",
        subtotalAmount: 1000,
        taxAmount: 0,
        totalAmount: 1000,
        paymentId: "pay-1",
        createdAt,
      },
    ]);
    const itemFindMany = vi.fn().mockResolvedValue([
      {
        id: "order-item-1",
        orderId: "order-1",
        productKey: "premiumContent",
        quantity: 1,
        unitPrice: 1000,
        totalAmount: 1000,
        currency: "EUR",
        providerProductId: "pdt_transaction_premium_content",
        metadata: null,
      },
    ]);
    const service = createTransactionService({
      db: {
        query: {
          transactionOrders: {
            findMany,
          },
          transactionOrderItems: {
            findMany: itemFindMany,
          },
        },
      } as any,
      paymentProvider: createPaymentProvider() as any,
      checkoutIntents: createCheckoutIntents() as any,
    });

    await expect(service.listOrders("user-1")).resolves.toEqual([
      {
        id: "order-1",
        status: "paid",
        currency: "EUR",
        subtotalAmount: 1000,
        taxAmount: 0,
        totalAmount: 1000,
        paymentId: "pay-1",
        createdAt: "2026-08-03T00:00:00.000Z",
        items: [
          {
            id: "order-item-1",
            productKey: "premiumContent",
            quantity: 1,
            unitPrice: 1000,
            totalAmount: 1000,
            currency: "EUR",
            providerProductId: "pdt_transaction_premium_content",
            name: "Premium content access",
            description: "One durable entitlement for the premium content product.",
          },
        ],
      },
    ]);
    const query = new PgDialect().sqlToQuery(findMany.mock.calls[0]![0].where);
    expect(query.sql).toContain("status\" in");
    expect(query.params).toEqual(["user-1", "paid", "partially_refunded", "refunded"]);
    expect(findMany.mock.calls[0]![0].limit).toBe(50);
    expect(itemFindMany).toHaveBeenCalledTimes(1);
    const itemQuery = new PgDialect().sqlToQuery(itemFindMany.mock.calls[0]![0].where);
    expect(itemQuery.sql).toContain("order_id\" in");
    expect(itemQuery.params).toEqual(["order-1"]);
  });

  it("does not query order items when customer history is empty", async () => {
    const itemFindMany = vi.fn();
    const service = createTransactionService({
      db: {
        query: {
          transactionOrders: { findMany: vi.fn().mockResolvedValue([]) },
          transactionOrderItems: { findMany: itemFindMany },
        },
      } as any,
      paymentProvider: createPaymentProvider() as any,
      checkoutIntents: createCheckoutIntents() as any,
    });

    await expect(service.listOrders("user-1")).resolves.toEqual([]);
    expect(itemFindMany).not.toHaveBeenCalled();
  });

  it("loads and maps items for multiple customer orders with one query", async () => {
    const createdAt = new Date("2026-08-03T00:00:00.000Z");
    const orders = [
      { id: "order-2", status: "refunded", currency: "EUR", subtotalAmount: 1000, taxAmount: 0, totalAmount: 1000, createdAt },
      { id: "order-1", status: "paid", currency: "EUR", subtotalAmount: 1500, taxAmount: 0, totalAmount: 1500, createdAt },
    ];
    const itemFindMany = vi.fn().mockResolvedValue([
      { id: "item-1b", orderId: "order-1", productKey: "premiumContent", quantity: 1, unitPrice: 1000, totalAmount: 1000, currency: "EUR" },
      { id: "item-2", orderId: "order-2", productKey: "premiumContent", quantity: 1, unitPrice: 1000, totalAmount: 1000, currency: "EUR" },
      { id: "item-1a", orderId: "order-1", productKey: "starterContent", quantity: 1, unitPrice: 500, totalAmount: 500, currency: "EUR" },
    ]);
    const service = createTransactionService({
      db: {
        query: {
          transactionOrders: { findMany: vi.fn().mockResolvedValue(orders) },
          transactionOrderItems: { findMany: itemFindMany },
        },
      } as any,
      paymentProvider: createPaymentProvider() as any,
      checkoutIntents: createCheckoutIntents() as any,
    });

    const result = await service.listOrders("user-1");

    expect(itemFindMany).toHaveBeenCalledTimes(1);
    const itemQuery = new PgDialect().sqlToQuery(itemFindMany.mock.calls[0]![0].where);
    expect(itemQuery.params).toEqual(["order-2", "order-1"]);
    expect(result.map((order) => order.id)).toEqual(["order-2", "order-1"]);
    expect(result[0]?.items.map((item) => item.id)).toEqual(["item-2"]);
    expect(result[1]?.items.map((item) => item.id)).toEqual(["item-1b", "item-1a"]);
  });

  it.each([
    ["pending_payment", false],
    ["paid", true],
    ["failed", false],
    ["cancelled", false],
    ["refunded", true],
    ["partially_refunded", true],
  ] as const)("defines transaction order status %s customer visibility", (status, expected) => {
    expect(isCustomerVisibleTransactionOrderStatus(status)).toBe(expected);
  });

  it.each(["pending_payment", "failed", "cancelled"] as const)("hides %s order detail from customers", async (status) => {
    const findFirst = vi.fn().mockImplementation(({ where }) => {
      const query = new PgDialect().sqlToQuery(where);
      return Promise.resolve(query.params.includes(status) ? { id: "order-1", status } : null);
    });
    const itemFindMany = vi.fn();
    const service = createTransactionService({
      db: { query: { transactionOrders: { findFirst }, transactionOrderItems: { findMany: itemFindMany } } } as any,
      paymentProvider: createPaymentProvider() as any,
      checkoutIntents: createCheckoutIntents() as any,
    });

    await expect(service.getOrder("user-1", "order-1")).resolves.toBeNull();
    const query = new PgDialect().sqlToQuery(findFirst.mock.calls[0]![0].where);
    expect(query.params).toEqual(["order-1", "user-1", "paid", "partially_refunded", "refunded"]);
    expect(itemFindMany).not.toHaveBeenCalled();
  });

  it.each(["paid", "partially_refunded", "refunded"] as const)("shows %s order detail to customers", async (status) => {
    const createdAt = new Date("2026-08-03T00:00:00.000Z");
    const findFirst = vi.fn().mockImplementation(({ where }) => {
      const query = new PgDialect().sqlToQuery(where);
      return Promise.resolve(query.params.includes(status)
        ? { id: "order-1", status, currency: "EUR", subtotalAmount: 500, taxAmount: 0, totalAmount: 500, createdAt }
        : null);
    });
    const service = createTransactionService({
      db: {
        query: {
          transactionOrders: { findFirst },
          transactionOrderItems: { findMany: vi.fn().mockResolvedValue([]) },
        },
      } as any,
      paymentProvider: createPaymentProvider() as any,
      checkoutIntents: createCheckoutIntents() as any,
    });

    await expect(service.getOrder("user-1", "order-1")).resolves.toMatchObject({ status });
  });

  it("serializes order items with metadata names when an order is fetched", async () => {
    const createdAt = new Date("2026-08-03T00:00:00.000Z");
    const service = createTransactionService({
      db: {
        query: {
          transactionOrders: {
            findFirst: vi.fn().mockResolvedValue({
              id: "order-1",
              userId: "user-1",
              status: "paid",
              currency: "EUR",
              subtotalAmount: 500,
              taxAmount: 0,
              totalAmount: 500,
              paymentId: null,
              createdAt,
            }),
          },
          transactionOrderItems: {
            findMany: vi.fn().mockResolvedValue([
              {
                id: "order-item-1",
                productKey: "starterContent",
                quantity: 1,
                unitPrice: 500,
                totalAmount: 500,
                currency: "EUR",
                providerProductId: "pdt_transaction_starter_content",
                metadata: { name: "Recorded starter content", description: "Recorded at checkout" },
              },
            ]),
          },
        },
      } as any,
      paymentProvider: createPaymentProvider() as any,
      checkoutIntents: createCheckoutIntents() as any,
    });

    await expect(service.getOrder("user-1", "order-1")).resolves.toMatchObject({
      id: "order-1",
      createdAt: "2026-08-03T00:00:00.000Z",
      items: [
        {
          id: "order-item-1",
          name: "Recorded starter content",
          description: "Recorded at checkout",
        },
      ],
    });
  });

  it("rejects completed payments when order user does not match metadata user", async () => {
    const checkoutIntents = createCheckoutIntents();
    const tx = {
      query: {
        transactionOrders: {
          findFirst: vi.fn().mockResolvedValue({
            id: "order-1",
            userId: "other-user",
            status: "pending_payment",
            currency: "EUR",
            subtotalAmount: 1000,
            totalAmount: 1000,
            taxAmount: 0,
          }),
        },
        transactionOrderItems: { findMany: vi.fn() },
      },
      update: createUpdateMock(),
      insert: vi.fn(),
    };
    const service = createTransactionService({
      db: { transaction: vi.fn(async (callback) => callback(tx)) } as any,
      paymentProvider: createPaymentProvider() as any,
      checkoutIntents: checkoutIntents as any,
    });

    await expect(service.handleTransactionPayment({
      userId: "user-1",
      orderId: "order-1",
      checkoutReferenceId: "checkout-ref-1",
      paymentId: "pay-1",
      paymentStatus: "completed",
      currency: "EUR",
      totalAmount: 1000,
      taxAmount: 0,
      cartItems: [{ productId: "pdt_transaction_starter_content", quantity: 1 }],
    })).rejects.toThrow("transaction order user mismatch");
    expect(tx.query.transactionOrderItems.findMany).not.toHaveBeenCalled();
  });

  it("rejects completed payments when provider cart line items do not match order items", async () => {
    const checkoutIntents = createCheckoutIntents();
    const tx = {
      query: {
        transactionOrders: {
          findFirst: vi.fn().mockResolvedValue({
            id: "order-1",
            userId: "user-1",
            status: "pending_payment",
            currency: "EUR",
            subtotalAmount: 1000,
            totalAmount: 1000,
            taxAmount: 0,
          }),
        },
        transactionOrderItems: {
          findMany: vi.fn().mockResolvedValue([
            { id: "order-item-1", providerProductId: "pdt_transaction_starter_content", quantity: 2, productKey: "starterContent" },
          ]),
        },
      },
      update: createUpdateMock(),
      insert: vi.fn(),
    };
    const service = createTransactionService({
      db: { transaction: vi.fn(async (callback) => callback(tx)) } as any,
      paymentProvider: createPaymentProvider() as any,
      checkoutIntents: checkoutIntents as any,
    });

    await expect(service.handleTransactionPayment({
      userId: "user-1",
      orderId: "order-1",
      checkoutReferenceId: "checkout-ref-1",
      paymentId: "pay-1",
      paymentStatus: "completed",
      currency: "EUR",
      totalAmount: 1210,
      taxAmount: 210,
      cartItems: [{ productId: "pdt_transaction_starter_content", quantity: 1 }],
    })).rejects.toThrow("provider cart line items mismatch");
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("marks pending payments with the transaction executor after a conditional pending update", async () => {
    const checkoutIntents = createCheckoutIntents();
    const updates: Array<{ table: unknown; set: unknown }> = [];
    const tx = {
      query: {
        transactionOrders: {
          findFirst: vi.fn().mockResolvedValue({
            id: "order-1",
            userId: "user-1",
            status: "pending_payment",
            currency: "EUR",
            subtotalAmount: 1000,
            totalAmount: 1000,
            taxAmount: 0,
          }),
        },
        transactionOrderItems: {
          findMany: vi.fn().mockResolvedValue([
            { id: "order-item-1", providerProductId: "pdt_transaction_starter_content", quantity: 2, productKey: "starterContent" },
          ]),
        },
      },
      update: createUpdateMock(updates, [[{ id: "order-1", status: "pending_payment" }]]),
      insert: vi.fn(),
    };
    const service = createTransactionService({
      db: { transaction: vi.fn(async (callback) => callback(tx)) } as any,
      paymentProvider: createPaymentProvider() as any,
      checkoutIntents: checkoutIntents as any,
    });

    await expect(service.handleTransactionPayment({
      userId: "user-1",
      orderId: "order-1",
      checkoutReferenceId: "checkout-ref-1",
      paymentId: "pay-1",
      paymentStatus: "pending",
      currency: "EUR",
      totalAmount: 1210,
      taxAmount: 210,
      cartItems: [{ productId: "pdt_transaction_starter_content", quantity: 2 }],
    })).resolves.toMatchObject({ id: "order-1" });
    expect(updates[0]?.set).toEqual(expect.objectContaining({
      subtotalAmount: 1000,
      taxAmount: 210,
      totalAmount: 1210,
    }));
    expect(checkoutIntents.markPending).toHaveBeenCalledWith({ id: "intent-1", paymentId: "pay-1" }, tx);
  });

  it("marks failed payments with the transaction executor after a conditional failed update", async () => {
    const checkoutIntents = createCheckoutIntents();
    const updates: Array<{ table: unknown; set: unknown }> = [];
    const tx = {
      query: {
        transactionOrders: {
          findFirst: vi.fn().mockResolvedValue({
            id: "order-1",
            userId: "user-1",
            status: "pending_payment",
            currency: "EUR",
            subtotalAmount: 1000,
            totalAmount: 1000,
            taxAmount: 0,
          }),
        },
        transactionOrderItems: {
          findMany: vi.fn().mockResolvedValue([
            { id: "order-item-1", providerProductId: "pdt_transaction_starter_content", quantity: 2, productKey: "starterContent" },
          ]),
        },
      },
      update: createUpdateMock(updates, [[{ id: "order-1", status: "failed" }]]),
      insert: vi.fn(),
    };
    const service = createTransactionService({
      db: { transaction: vi.fn(async (callback) => callback(tx)) } as any,
      paymentProvider: createPaymentProvider() as any,
      checkoutIntents: checkoutIntents as any,
    });

    await expect(service.handleTransactionPayment({
      userId: "user-1",
      orderId: "order-1",
      checkoutReferenceId: "checkout-ref-1",
      paymentId: "pay-1",
      paymentStatus: "failed",
      currency: "EUR",
      totalAmount: 1210,
      taxAmount: 210,
      cartItems: [{ productId: "pdt_transaction_starter_content", quantity: 2 }],
    })).resolves.toMatchObject({ id: "order-1" });
    expect(updates[0]?.set).toEqual(expect.objectContaining({
      subtotalAmount: 1000,
      taxAmount: 210,
      totalAmount: 1210,
    }));
    expect(checkoutIntents.markFailed).toHaveBeenCalledWith({ id: "intent-1", paymentId: "pay-1" }, tx);
  });

  it("marks completed payments with the transaction executor after a conditional paid update", async () => {
    const checkoutIntents = createCheckoutIntents();
    const updates: Array<{ table: unknown; set: unknown }> = [];
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const tx = {
      query: {
        transactionOrders: {
          findFirst: vi.fn().mockResolvedValue({
            id: "order-1",
            userId: "user-1",
            status: "pending_payment",
            currency: "EUR",
            subtotalAmount: 1000,
            totalAmount: 1000,
            taxAmount: 0,
          }),
        },
        transactionOrderItems: {
          findMany: vi.fn().mockResolvedValue([
            { id: "order-item-1", providerProductId: "pdt_transaction_starter_content", quantity: 2, productKey: "starterContent" },
          ]),
        },
      },
      update: createUpdateMock(updates, [[{ id: "order-1", status: "paid" }]]),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({ onConflictDoNothing }),
      }),
    };
    const service = createTransactionService({
      db: { transaction: vi.fn(async (callback) => callback(tx)) } as any,
      paymentProvider: createPaymentProvider() as any,
      checkoutIntents: checkoutIntents as any,
    });

    await expect(service.handleTransactionPayment({
      userId: "user-1",
      orderId: "order-1",
      checkoutReferenceId: "checkout-ref-1",
      paymentId: "pay-1",
      paymentStatus: "completed",
      currency: "EUR",
      totalAmount: 1210,
      taxAmount: 210,
      cartItems: [{ productId: "pdt_transaction_starter_content", quantity: 2 }],
    })).resolves.toMatchObject({ id: "order-1" });
    expect(updates[0]?.set).toEqual(expect.objectContaining({
      subtotalAmount: 1000,
      taxAmount: 210,
      totalAmount: 1210,
    }));
    expect(checkoutIntents.markCompleted).toHaveBeenCalledWith({ id: "intent-1", paymentId: "pay-1" }, tx);
  });

  it("rejects payments whose tax-exclusive total does not match the stored subtotal", async () => {
    const tx = {
      query: {
        transactionOrders: {
          findFirst: vi.fn().mockResolvedValue({
            id: "order-1",
            userId: "user-1",
            status: "pending_payment",
            currency: "EUR",
            subtotalAmount: 1000,
            totalAmount: 1000,
            taxAmount: 0,
          }),
        },
        transactionOrderItems: { findMany: vi.fn() },
      },
      update: createUpdateMock(),
      insert: vi.fn(),
    };
    const service = createTransactionService({
      db: { transaction: vi.fn(async (callback) => callback(tx)) } as any,
      paymentProvider: createPaymentProvider() as any,
      checkoutIntents: createCheckoutIntents() as any,
    });

    await expect(service.handleTransactionPayment({
      userId: "user-1",
      orderId: "order-1",
      checkoutReferenceId: "checkout-ref-1",
      paymentId: "pay-1",
      paymentStatus: "completed",
      currency: "EUR",
      totalAmount: 1209,
      taxAmount: 210,
      cartItems: [{ productId: "pdt_transaction_starter_content", quantity: 2 }],
    })).rejects.toThrow("transaction subtotal mismatch");
    expect(tx.query.transactionOrderItems.findMany).not.toHaveBeenCalled();
  });

  it.each([
    { totalAmount: 1210.5, taxAmount: 210, error: "invalid total amount" },
    { totalAmount: 2_147_483_648, taxAmount: 2_147_482_648, error: "invalid total amount" },
    { totalAmount: 1210, taxAmount: 210.5, error: "invalid tax amount" },
    { totalAmount: 2_147_483_647, taxAmount: 2_147_483_648, error: "invalid tax amount" },
    { totalAmount: 1000, taxAmount: -1, error: "invalid tax amount" },
    { totalAmount: 1000, taxAmount: 1001, error: "invalid tax amount" },
  ])("rejects PostgreSQL-unsafe payment amounts $totalAmount/$taxAmount", async ({ totalAmount, taxAmount, error }) => {
    const tx = {
      query: {
        transactionOrders: {
          findFirst: vi.fn().mockResolvedValue({
            id: "order-1",
            userId: "user-1",
            status: "pending_payment",
            currency: "EUR",
            subtotalAmount: 1000,
            totalAmount: 1000,
            taxAmount: 0,
          }),
        },
        transactionOrderItems: { findMany: vi.fn() },
      },
      update: createUpdateMock(),
      insert: vi.fn(),
    };
    const service = createTransactionService({
      db: { transaction: vi.fn(async (callback) => callback(tx)) } as any,
      paymentProvider: createPaymentProvider() as any,
      checkoutIntents: createCheckoutIntents() as any,
    });

    await expect(service.handleTransactionPayment({
      userId: "user-1",
      orderId: "order-1",
      checkoutReferenceId: "checkout-ref-1",
      paymentId: "pay-1",
      paymentStatus: "completed",
      currency: "EUR",
      totalAmount,
      taxAmount,
      cartItems: [{ productId: "pdt_transaction_starter_content", quantity: 2 }],
    })).rejects.toThrow(error);
    expect(tx.query.transactionOrderItems.findMany).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("rejects a pending order already bound to another payment", async () => {
    const tx = {
      query: {
        transactionOrders: {
          findFirst: vi.fn().mockResolvedValue({
            id: "order-1",
            userId: "user-1",
            status: "pending_payment",
            paymentId: "other-pay",
            currency: "EUR",
            subtotalAmount: 1000,
            totalAmount: 1210,
            taxAmount: 210,
          }),
        },
        transactionOrderItems: { findMany: vi.fn() },
      },
      update: createUpdateMock(),
      insert: vi.fn(),
    };
    const service = createTransactionService({
      db: { transaction: vi.fn(async (callback) => callback(tx)) } as any,
      paymentProvider: createPaymentProvider() as any,
      checkoutIntents: createCheckoutIntents() as any,
    });

    await expect(service.handleTransactionPayment({
      userId: "user-1",
      orderId: "order-1",
      checkoutReferenceId: "checkout-ref-1",
      paymentId: "pay-1",
      paymentStatus: "pending",
      currency: "EUR",
      totalAmount: 1210,
      taxAmount: 210,
      cartItems: [{ productId: "pdt_transaction_starter_content", quantity: 2 }],
    })).rejects.toThrow("transaction order payment mismatch");
    expect(tx.query.transactionOrderItems.findMany).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("rejects a pending payment when a competing payment wins the conditional update race", async () => {
    const checkoutIntents = createCheckoutIntents();
    const tx = {
      query: {
        transactionOrders: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({
              id: "order-1",
              userId: "user-1",
              status: "pending_payment",
              paymentId: null,
              currency: "EUR",
              subtotalAmount: 1000,
              totalAmount: 1000,
              taxAmount: 0,
            })
            .mockResolvedValueOnce({
              id: "order-1",
              userId: "user-1",
              status: "pending_payment",
              paymentId: "other-pay",
              currency: "EUR",
              subtotalAmount: 1000,
              totalAmount: 1210,
              taxAmount: 210,
            }),
        },
        transactionOrderItems: {
          findMany: vi.fn().mockResolvedValue([
            { id: "order-item-1", providerProductId: "pdt_transaction_starter_content", quantity: 2, productKey: "starterContent" },
          ]),
        },
      },
      update: createUpdateMock([], [[]]),
      insert: vi.fn(),
    };
    const service = createTransactionService({
      db: { transaction: vi.fn(async (callback) => callback(tx)) } as any,
      paymentProvider: createPaymentProvider() as any,
      checkoutIntents: checkoutIntents as any,
    });

    await expect(service.handleTransactionPayment({
      userId: "user-1",
      orderId: "order-1",
      checkoutReferenceId: "checkout-ref-1",
      paymentId: "pay-1",
      paymentStatus: "pending",
      currency: "EUR",
      totalAmount: 1210,
      taxAmount: 210,
      cartItems: [{ productId: "pdt_transaction_starter_content", quantity: 2 }],
    })).rejects.toThrow("transaction order payment mismatch");
    expect(checkoutIntents.markPending).not.toHaveBeenCalled();
  });

  it("does not treat a same-payment pending race as completed fulfillment", async () => {
    const checkoutIntents = createCheckoutIntents();
    const tx = {
      query: {
        transactionOrders: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({
              id: "order-1",
              userId: "user-1",
              status: "pending_payment",
              paymentId: null,
              currency: "EUR",
              subtotalAmount: 1000,
              totalAmount: 1000,
              taxAmount: 0,
            })
            .mockResolvedValueOnce({
              id: "order-1",
              userId: "user-1",
              status: "pending_payment",
              paymentId: "pay-1",
              currency: "EUR",
              subtotalAmount: 1000,
              totalAmount: 1210,
              taxAmount: 210,
            }),
        },
        transactionOrderItems: {
          findMany: vi.fn().mockResolvedValue([
            { id: "order-item-1", providerProductId: "pdt_transaction_starter_content", quantity: 2, productKey: "starterContent" },
          ]),
        },
      },
      update: createUpdateMock([], [[]]),
      insert: vi.fn(),
    };
    const service = createTransactionService({
      db: { transaction: vi.fn(async (callback) => callback(tx)) } as any,
      paymentProvider: createPaymentProvider() as any,
      checkoutIntents: checkoutIntents as any,
    });

    await expect(service.handleTransactionPayment({
      userId: "user-1",
      orderId: "order-1",
      checkoutReferenceId: "checkout-ref-1",
      paymentId: "pay-1",
      paymentStatus: "completed",
      currency: "EUR",
      totalAmount: 1210,
      taxAmount: 210,
      cartItems: [{ productId: "pdt_transaction_starter_content", quantity: 2 }],
    })).rejects.toThrow("transaction order is pending_payment");
    expect(tx.insert).not.toHaveBeenCalled();
    expect(checkoutIntents.markCompleted).not.toHaveBeenCalled();
  });

  it("refuses completed payments when the conditional paid update loses a race", async () => {
    const checkoutIntents = createCheckoutIntents();
    const tx = {
      query: {
        transactionOrders: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({
              id: "order-1",
              userId: "user-1",
              status: "pending_payment",
              currency: "EUR",
              subtotalAmount: 1000,
              totalAmount: 1000,
              taxAmount: 0,
            })
            .mockResolvedValueOnce({
              id: "order-1",
              userId: "user-1",
              status: "paid",
              paymentId: "other-pay",
              currency: "EUR",
              subtotalAmount: 1000,
              totalAmount: 1000,
              taxAmount: 0,
            }),
        },
        transactionOrderItems: {
          findMany: vi.fn().mockResolvedValue([
            { id: "order-item-1", providerProductId: "pdt_transaction_starter_content", quantity: 2, productKey: "starterContent" },
          ]),
        },
      },
      update: createUpdateMock([], [[]]),
      insert: vi.fn(),
    };
    const service = createTransactionService({
      db: { transaction: vi.fn(async (callback) => callback(tx)) } as any,
      paymentProvider: createPaymentProvider() as any,
      checkoutIntents: checkoutIntents as any,
    });

    await expect(service.handleTransactionPayment({
      userId: "user-1",
      orderId: "order-1",
      checkoutReferenceId: "checkout-ref-1",
      paymentId: "pay-1",
      paymentStatus: "completed",
      currency: "EUR",
      totalAmount: 1000,
      taxAmount: 0,
      cartItems: [{ productId: "pdt_transaction_starter_content", quantity: 2 }],
    })).rejects.toThrow("Refusing payment pay-1: transaction order is paid.");
    expect(tx.insert).not.toHaveBeenCalled();
    expect(checkoutIntents.markCompleted).not.toHaveBeenCalled();
  });

  it("does not create duplicate entitlements for duplicate completed webhooks", async () => {
    const checkoutIntents = createCheckoutIntents();
    const tx = {
      query: {
        transactionOrders: {
          findFirst: vi.fn().mockResolvedValue({
            id: "order-1",
            userId: "user-1",
            status: "paid",
            paymentId: "pay-1",
            currency: "EUR",
            subtotalAmount: 1000,
            totalAmount: 1210,
            taxAmount: 210,
          }),
        },
        transactionOrderItems: {
          findMany: vi.fn().mockResolvedValue([
            { id: "order-item-1", providerProductId: "pdt_transaction_starter_content", quantity: 2, productKey: "starterContent" },
          ]),
        },
      },
      update: createUpdateMock(),
      insert: vi.fn(),
    };
    const service = createTransactionService({
      db: { transaction: vi.fn(async (callback) => callback(tx)) } as any,
      paymentProvider: createPaymentProvider() as any,
      checkoutIntents: checkoutIntents as any,
    });

    await expect(service.handleTransactionPayment({
      userId: "user-1",
      orderId: "order-1",
      checkoutReferenceId: "checkout-ref-1",
      paymentId: "pay-1",
      paymentStatus: "completed",
      currency: "EUR",
      totalAmount: 1210,
      taxAmount: 210,
      cartItems: [{ productId: "pdt_transaction_starter_content", quantity: 2 }],
    })).resolves.toMatchObject({ id: "order-1", status: "paid" });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(checkoutIntents.markCompleted).not.toHaveBeenCalled();
  });

  it("rejects same-payment replays with altered tax and total despite the same subtotal", async () => {
    const checkoutIntents = createCheckoutIntents();
    const tx = {
      query: {
        transactionOrders: {
          findFirst: vi.fn().mockResolvedValue({
            id: "order-1",
            userId: "user-1",
            status: "paid",
            paymentId: "pay-1",
            currency: "EUR",
            subtotalAmount: 1000,
            totalAmount: 1210,
            taxAmount: 210,
          }),
        },
        transactionOrderItems: {
          findMany: vi.fn().mockResolvedValue([
            { id: "order-item-1", providerProductId: "pdt_transaction_starter_content", quantity: 2, productKey: "starterContent" },
          ]),
        },
      },
      update: createUpdateMock(),
      insert: vi.fn(),
    };
    const service = createTransactionService({
      db: { transaction: vi.fn(async (callback) => callback(tx)) } as any,
      paymentProvider: createPaymentProvider() as any,
      checkoutIntents: checkoutIntents as any,
    });

    await expect(service.handleTransactionPayment({
      userId: "user-1",
      orderId: "order-1",
      checkoutReferenceId: "checkout-ref-1",
      paymentId: "pay-1",
      paymentStatus: "completed",
      currency: "EUR",
      totalAmount: 1220,
      taxAmount: 220,
      cartItems: [{ productId: "pdt_transaction_starter_content", quantity: 2 }],
    })).rejects.toThrow("payment replay amounts mismatch");
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(checkoutIntents.markCompleted).not.toHaveBeenCalled();
  });

  it("does not mark paid orders pending for out-of-order pending webhooks with the same payment", async () => {
    const checkoutIntents = createCheckoutIntents();
    const tx = {
      query: {
        transactionOrders: {
          findFirst: vi.fn().mockResolvedValue({
            id: "order-1",
            userId: "user-1",
            status: "paid",
            paymentId: "pay-1",
            currency: "EUR",
            subtotalAmount: 1000,
            totalAmount: 1000,
            taxAmount: 0,
          }),
        },
        transactionOrderItems: {
          findMany: vi.fn().mockResolvedValue([
            { id: "order-item-1", providerProductId: "pdt_transaction_starter_content", quantity: 2, productKey: "starterContent" },
          ]),
        },
      },
      update: createUpdateMock(),
      insert: vi.fn(),
    };
    const service = createTransactionService({
      db: { transaction: vi.fn(async (callback) => callback(tx)) } as any,
      paymentProvider: createPaymentProvider() as any,
      checkoutIntents: checkoutIntents as any,
    });

    await expect(service.handleTransactionPayment({
      userId: "user-1",
      orderId: "order-1",
      checkoutReferenceId: "checkout-ref-1",
      paymentId: "pay-1",
      paymentStatus: "pending",
      currency: "EUR",
      totalAmount: 1000,
      taxAmount: 0,
      cartItems: [{ productId: "pdt_transaction_starter_content", quantity: 2 }],
    })).resolves.toMatchObject({ id: "order-1", status: "paid" });
    expect(tx.update).not.toHaveBeenCalled();
    expect(checkoutIntents.markPending).not.toHaveBeenCalled();
  });

  it("does not mark paid orders failed for out-of-order failed webhooks with the same payment", async () => {
    const checkoutIntents = createCheckoutIntents();
    const tx = {
      query: {
        transactionOrders: {
          findFirst: vi.fn().mockResolvedValue({
            id: "order-1",
            userId: "user-1",
            status: "paid",
            paymentId: "pay-1",
            currency: "EUR",
            subtotalAmount: 1000,
            totalAmount: 1000,
            taxAmount: 0,
          }),
        },
        transactionOrderItems: {
          findMany: vi.fn().mockResolvedValue([
            { id: "order-item-1", providerProductId: "pdt_transaction_starter_content", quantity: 2, productKey: "starterContent" },
          ]),
        },
      },
      update: createUpdateMock(),
      insert: vi.fn(),
    };
    const service = createTransactionService({
      db: { transaction: vi.fn(async (callback) => callback(tx)) } as any,
      paymentProvider: createPaymentProvider() as any,
      checkoutIntents: checkoutIntents as any,
    });

    await expect(service.handleTransactionPayment({
      userId: "user-1",
      orderId: "order-1",
      checkoutReferenceId: "checkout-ref-1",
      paymentId: "pay-1",
      paymentStatus: "failed",
      currency: "EUR",
      totalAmount: 1000,
      taxAmount: 0,
      cartItems: [{ productId: "pdt_transaction_starter_content", quantity: 2 }],
    })).resolves.toMatchObject({ id: "order-1", status: "paid" });
    expect(tx.update).not.toHaveBeenCalled();
    expect(checkoutIntents.markFailed).not.toHaveBeenCalled();
  });
});

describe("transaction service refunds", () => {
  const paidOrder = {
    id: "order-1",
    userId: "user-1",
    status: "paid",
    paymentId: "pay-1",
    paymentProvider: "dodo",
  };
  const availableEntitlements = [
    { id: "entitlement-1", orderId: "order-1", status: "available" },
    { id: "entitlement-2", orderId: "order-1", status: "available" },
  ];

  it("creates an idempotent provider refund and revokes unused entitlements", async () => {
    const updates: Array<{ table: unknown; set: unknown }> = [];
    const updatedOrder = { ...paidOrder, status: "refunded" };
    const tx = {
      query: {
        transactionOrders: { findFirst: vi.fn().mockResolvedValue(paidOrder) },
        transactionEntitlements: { findMany: vi.fn().mockResolvedValue(availableEntitlements) },
      },
      update: createUpdateMock(updates, [availableEntitlements, [updatedOrder]]),
    };
    const createRefund = vi.fn().mockResolvedValue({
      refundId: "refund-1",
      paymentId: "pay-1",
      status: "succeeded",
      amount: 1000,
      currency: "EUR",
    });
    const service = createTransactionService({
      db: { transaction: vi.fn(async (callback) => callback(tx)), update: tx.update } as any,
      paymentProvider: createPaymentProvider({ createRefund }) as any,
      checkoutIntents: createCheckoutIntents() as any,
    });

    await expect(service.createTransactionRefund({ orderId: "order-1", reason: "Customer request", actorUserId: "admin-1" }))
      .resolves.toEqual({ refund: expect.objectContaining({ refundId: "refund-1" }), order: expect.objectContaining({ id: "order-1", status: "refunded" }) });
    expect(createRefund).toHaveBeenCalledWith({
      paymentId: "pay-1",
      reason: "Customer request",
      metadata: {
        initiated_by: "admin_api",
        user_id: "user-1",
        local_transaction_order_id: "order-1",
        actor_user_id: "admin-1",
      },
      idempotencyKey: "transaction-refund:dodo:pay-1",
    });
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ set: expect.objectContaining({ status: "refunded", refundedAt: expect.any(Date) }) }),
      expect.objectContaining({ set: expect.objectContaining({ status: "refunded" }) }),
    ]));
  });

  it("refuses refunds after an entitlement has been consumed", async () => {
    const createRefund = vi.fn();
    const tx = {
      query: {
        transactionOrders: { findFirst: vi.fn().mockResolvedValue(paidOrder) },
        transactionEntitlements: { findMany: vi.fn().mockResolvedValue([{ ...availableEntitlements[0], status: "consumed" }]) },
      },
      update: createUpdateMock(),
    };
    const service = createTransactionService({
      db: { transaction: vi.fn(async (callback) => callback(tx)) } as any,
      paymentProvider: createPaymentProvider({ createRefund }) as any,
      checkoutIntents: createCheckoutIntents() as any,
    });

    await expect(service.createTransactionRefund({ orderId: "order-1" })).rejects.toThrow("Orders with consumed entitlements cannot be refunded");
    expect(createRefund).not.toHaveBeenCalled();
  });

  it("restores claimed entitlements when the provider refund fails", async () => {
    const updates: Array<{ table: unknown; set: unknown }> = [];
    const update = createUpdateMock(updates, [availableEntitlements, [paidOrder]]);
    const tx = {
      query: {
        transactionOrders: { findFirst: vi.fn().mockResolvedValue(paidOrder) },
        transactionEntitlements: { findMany: vi.fn().mockResolvedValue(availableEntitlements) },
      },
      update,
    };
    const service = createTransactionService({
      db: { transaction: vi.fn(async (callback) => callback(tx)), update } as any,
      paymentProvider: createPaymentProvider({ createRefund: vi.fn().mockRejectedValue(new Error("provider unavailable")) }) as any,
      checkoutIntents: createCheckoutIntents() as any,
    });

    await expect(service.createTransactionRefund({ orderId: "order-1" })).rejects.toThrow("provider unavailable");
    expect(updates.at(-1)?.set).toEqual(expect.objectContaining({ status: "available", refundedAt: null }));
  });
});
