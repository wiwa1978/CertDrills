import { describe, expect, it } from "vitest";

import { queryKeys } from "../src/query-keys";

describe("queryKeys", () => {
  it("provides stable credits keys", () => {
    expect(queryKeys.credits.balance).toEqual(["me", "credits", "balance"]);
    expect(queryKeys.credits.history(25)).toEqual(["me", "credits", "history", 25]);
    expect(queryKeys.credits.purchases(10)).toEqual(["me", "credits", "purchases", 10]);
  });

  it("provides stable notification keys", () => {
    expect(queryKeys.notifications.list(20)).toEqual(["me", "notifications", 20]);
    expect(queryKeys.notifications.unreadCount).toEqual(["me", "notifications", "unread-count"]);
    expect(queryKeys.notifications.activeBanner).toEqual(["me", "notifications", "active-banner"]);
  });

  it("provides stable transaction keys", () => {
    expect(queryKeys.transactions.basket("user-1")).toEqual(["me", "user-1", "transactions", "basket"]);
    expect(queryKeys.transactions.orders("user-1")).toEqual(["me", "user-1", "transactions", "orders"]);
    expect(queryKeys.transactions.order("user-1", "order/1")).toEqual(["me", "user-1", "transactions", "orders", "order/1"]);
    expect(queryKeys.transactions.entitlements("user-1")).toEqual(["me", "user-1", "transactions", "entitlements"]);
    expect(queryKeys.transactions.basket("user-2")).not.toEqual(queryKeys.transactions.basket("user-1"));
  });
});
