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
});
