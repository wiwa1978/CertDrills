import { describe, expect, it, vi } from "vitest";

import { createMeApi } from "../src/me-api";

describe("createMeApi data export helpers", () => {
  it("calls the data export endpoints with encoded ids", async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => ({ path, init }));
    const me = createMeApi(request);

    await expect(me.listDataExports()).resolves.toEqual({ path: "/me/data-exports", init: undefined });
    await expect(me.createDataExport()).resolves.toEqual({ path: "/me/data-exports", init: { method: "POST" } });
    await expect(me.cancelDataExport("export/1")).resolves.toEqual({
      path: "/me/data-exports/export%2F1",
      init: { method: "DELETE" },
    });
  });
});

describe("createMeApi transaction helpers", () => {
  it("reads the basket, orders, order detail, and entitlements", async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => ({ path, init }));
    const me = createMeApi(request);

    await expect(me.getTransactionBasket()).resolves.toEqual({ path: "/me/transaction-basket", init: undefined });
    await expect(me.getTransactionOrders()).resolves.toEqual({ path: "/me/transaction-orders", init: undefined });
    await expect(me.getTransactionOrder("order/1")).resolves.toEqual({ path: "/me/transaction-orders/order%2F1", init: undefined });
    await expect(me.getTransactionEntitlements()).resolves.toEqual({ path: "/me/transaction-entitlements", init: undefined });
  });

  it("mutates basket items with exact methods and JSON bodies", async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => ({ path, init }));
    const me = createMeApi(request);

    await expect(me.upsertTransactionBasketItem("product/1", 3)).resolves.toEqual({
      path: "/me/transaction-basket/items",
      init: { method: "PUT", body: JSON.stringify({ productKey: "product/1", quantity: 3 }) },
    });
    await expect(me.removeTransactionBasketItem("product/1")).resolves.toEqual({
      path: "/me/transaction-basket/items/product%2F1",
      init: { method: "DELETE" },
    });
    await expect(me.clearTransactionBasket()).resolves.toEqual({
      path: "/me/transaction-basket",
      init: { method: "DELETE" },
    });
  });

  it("creates checkout with POST and no body", async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => ({ path, init }));
    const me = createMeApi(request);

    await expect(me.createTransactionCheckout()).resolves.toEqual({
      path: "/me/transaction-basket/checkout",
      init: { method: "POST" },
    });
  });
});
