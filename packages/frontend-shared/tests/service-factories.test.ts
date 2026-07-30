import { describe, expect, it, vi } from "vitest";

import * as frontendShared from "../src";
import { createCreditsApi } from "../src/credits";
import { createMeApi } from "../src/me-api";
import { createNotificationsApi } from "../src/notifications";

describe("service factories", () => {
  it("creates credits helpers using the injected request function", async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => ({ path, init }));
    const credits = createCreditsApi(request);

    await expect(credits.getBalance()).resolves.toEqual({ path: "/me/credits/balance", init: undefined });
    await expect(credits.getHistory(25)).resolves.toEqual({ path: "/me/credits/history?limit=25", init: undefined });
    await expect(credits.getPurchases(10)).resolves.toEqual({ path: "/me/credits/purchases?limit=10", init: undefined });
    await expect(credits.downloadInvoice("pay_123")).resolves.toEqual({
      path: "/me/credits/invoice",
      init: { method: "POST", body: JSON.stringify({ paymentId: "pay_123" }) },
    });
  });

  it("encodes credits limit query values", async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => ({ path, init }));
    const credits = createCreditsApi(request);

    await expect(credits.getHistory("10 & 20" as unknown as number)).resolves.toEqual({
      path: "/me/credits/history?limit=10%20%26%2020",
      init: undefined,
    });
    await expect(credits.getPurchases("10 & 20" as unknown as number)).resolves.toEqual({
      path: "/me/credits/purchases?limit=10%20%26%2020",
      init: undefined,
    });
  });

  it("creates notification helpers using the injected request function", async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => ({ path, init }));
    const notifications = createNotificationsApi(request);

    await expect(notifications.list(15)).resolves.toEqual({ path: "/me/notifications?limit=15", init: undefined });
    await expect(notifications.getUnreadCount()).resolves.toEqual({ path: "/me/notifications/unread-count", init: undefined });
    await expect(notifications.getActiveBanner()).resolves.toEqual({ path: "/me/notifications/active-banner", init: undefined });
    await expect(notifications.markAsRead("notif_123")).resolves.toEqual({
      path: "/me/notifications/notif_123/read",
      init: { method: "POST" },
    });
    await expect(notifications.markAllAsRead()).resolves.toEqual({
      path: "/me/notifications/read-all",
      init: { method: "POST" },
    });
    await expect(notifications.delete("notif_123")).resolves.toEqual({
      path: "/me/notifications/notif_123",
      init: { method: "DELETE" },
    });
  });

  it("creates me helpers using the injected request function", async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.startsWith("/countries")) {
        return { success: true, data: [{ code: "NL" }] };
      }

      return { path, init };
    });
    const me = createMeApi(request);

    await expect(me.getSession()).resolves.toEqual({ path: "/me/session", init: undefined });
    await expect(me.getApplicationConfig()).resolves.toEqual({ path: "/me/application-config", init: undefined });
    await expect(me.getSubscription()).resolves.toEqual({ path: "/me/subscription", init: undefined });
    await expect(me.getSubscriptionPayments(12)).resolves.toEqual({ path: "/me/subscription/payments?limit=12", init: undefined });
    await expect(me.downloadSubscriptionInvoice("pay_sub_123")).resolves.toEqual({
      path: "/me/subscription/invoice",
      init: { method: "POST", body: JSON.stringify({ paymentId: "pay_sub_123" }) },
    });
    await expect(me.redeemVoucher("WELCOME")).resolves.toEqual({
      path: "/me/vouchers/redeem",
      init: { method: "POST", body: JSON.stringify({ code: "WELCOME" }) },
    });
    await expect(me.getCountries("nl")).resolves.toEqual([{ code: "NL" }]);
    expect(request).toHaveBeenCalledWith("/countries?lang=nl");
    await expect(me.createCheckoutSession("starter")).resolves.toEqual({
      path: "/payments/checkout",
      init: { method: "POST", body: JSON.stringify({ packageKey: "starter" }) },
    });
    await expect(me.createSubscriptionCheckoutSession("pro")).resolves.toEqual({
      path: "/payments/checkout",
      init: { method: "POST", body: JSON.stringify({ billingMode: "subscriptions", planKey: "pro" }) },
    });
    await expect(me.createCustomerPortalSession()).resolves.toEqual({
      path: "/me/customer-portal",
      init: { method: "POST" },
    });
  });

  it("keeps the client query provider out of the root barrel", () => {
    expect("SharedQueryProvider" in frontendShared).toBe(false);
    expect("createDefaultQueryClient" in frontendShared).toBe(false);
  });
});
