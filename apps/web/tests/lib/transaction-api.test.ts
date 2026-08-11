import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiRequest, serverApiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  serverApiRequest: vi.fn(),
}));

vi.mock("../../src/lib/api/client", () => ({ apiRequest }));
vi.mock("../../src/lib/api/client.server", () => ({ serverApiRequest }));

import {
  clearMyTransactionBasket,
  createMyTransactionCheckout,
  getMyTransactionBasket,
  getMyTransactionEntitlements,
  getMyTransactionOrder,
  getMyTransactionOrders,
  removeMyTransactionBasketItem,
  upsertMyTransactionBasketItem,
} from "../../src/lib/api/me";
import {
  getMyApplicationConfigForLayoutServer,
  getMyApplicationConfigServer,
  getMyTransactionBasketServer,
  getMyTransactionEntitlementsServer,
  getMyTransactionOrderServer,
  getMyTransactionOrdersServer,
} from "../../src/lib/api/me.server";

describe("transaction API wrappers", () => {
  beforeEach(() => {
    apiRequest.mockResolvedValue({ success: true, data: { value: "client" } });
    serverApiRequest.mockResolvedValue({ success: true, data: { value: "server" } });
  });

  it("unwraps client transaction reads", async () => {
    await expect(getMyTransactionBasket()).resolves.toEqual({ value: "client" });
    await expect(getMyTransactionOrders()).resolves.toEqual({ value: "client" });
    await expect(getMyTransactionOrder("order/1")).resolves.toEqual({ value: "client" });
    await expect(getMyTransactionEntitlements()).resolves.toEqual({ value: "client" });

    expect(apiRequest).toHaveBeenNthCalledWith(1, "/me/transaction-basket");
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/me/transaction-orders");
    expect(apiRequest).toHaveBeenNthCalledWith(3, "/me/transaction-orders/order%2F1");
    expect(apiRequest).toHaveBeenNthCalledWith(4, "/me/transaction-entitlements");
  });

  it("preserves client mutation result envelopes", async () => {
    const result = { success: true, data: { value: "client" } };
    apiRequest.mockResolvedValue(result);

    await expect(upsertMyTransactionBasketItem({ productKey: "product/1", quantity: 2 })).resolves.toBe(result);
    await expect(removeMyTransactionBasketItem("product/1")).resolves.toBe(result);
    await expect(clearMyTransactionBasket()).resolves.toBe(result);
    await expect(createMyTransactionCheckout()).resolves.toBe(result);

    expect(apiRequest).toHaveBeenNthCalledWith(1, "/me/transaction-basket/items", {
      method: "PUT",
      body: JSON.stringify({ productKey: "product/1", quantity: 2 }),
    });
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/me/transaction-basket/items/product%2F1", { method: "DELETE" });
    expect(apiRequest).toHaveBeenNthCalledWith(3, "/me/transaction-basket", { method: "DELETE" });
    expect(apiRequest).toHaveBeenNthCalledWith(4, "/me/transaction-basket/checkout", { method: "POST" });
  });

  it("unwraps server transaction reads", async () => {
    await expect(getMyTransactionBasketServer()).resolves.toEqual({ value: "server" });
    await expect(getMyTransactionOrdersServer()).resolves.toEqual({ value: "server" });
    await expect(getMyTransactionOrderServer("order/1")).resolves.toEqual({ value: "server" });
    await expect(getMyTransactionEntitlementsServer()).resolves.toEqual({ value: "server" });

    expect(serverApiRequest).toHaveBeenNthCalledWith(1, "/me/transaction-basket");
    expect(serverApiRequest).toHaveBeenNthCalledWith(2, "/me/transaction-orders");
    expect(serverApiRequest).toHaveBeenNthCalledWith(3, "/me/transaction-orders/order%2F1");
    expect(serverApiRequest).toHaveBeenNthCalledWith(4, "/me/transaction-entitlements");
  });

  it("keeps strict config reads strict while layout config reads fail safely", async () => {
    const failure = new Error("config unavailable");
    serverApiRequest.mockRejectedValue(failure);

    await expect(getMyApplicationConfigServer()).rejects.toBe(failure);
    await expect(getMyApplicationConfigForLayoutServer()).resolves.toBeUndefined();
  });
});
