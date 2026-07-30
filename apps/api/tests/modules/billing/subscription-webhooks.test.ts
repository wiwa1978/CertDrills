import { describe, expect, it, vi } from "vitest";

import {
  createSubscriptionWebhookHandler,
  getSubscriptionWebhookStatus,
  isProviderSubscriptionWebhookEvent,
} from "../../../src/modules/billing/subscription-webhooks";

describe("subscription webhooks", () => {
  it("detects provider subscription events", () => {
    expect(isProviderSubscriptionWebhookEvent("subscription.active")).toBe(true);
    expect(isProviderSubscriptionWebhookEvent("payment.succeeded")).toBe(false);
  });

  it("maps provider subscription events to local statuses", () => {
    expect(getSubscriptionWebhookStatus("subscription.active", "active")).toBe("active");
    expect(getSubscriptionWebhookStatus("subscription.renewed", "active")).toBe("active");
    expect(getSubscriptionWebhookStatus("subscription.cancelled", "cancelled")).toBe("canceled");
    expect(getSubscriptionWebhookStatus("subscription.failed", "failed")).toBe("past_due");
    expect(getSubscriptionWebhookStatus("subscription.expired", "expired")).toBe("expired");
    expect(getSubscriptionWebhookStatus("subscription.on_hold", "on_hold")).toBe("paused");
  });

  it("records and upserts subscription webhook data", async () => {
    const recordSubscriptionEvent = vi.fn().mockResolvedValue(undefined);
    const upsertUserSubscription = vi.fn().mockResolvedValue({ id: "sub" });
    const handler = createSubscriptionWebhookHandler({
      subscriptions: { recordSubscriptionEvent, upsertUserSubscription },
    });

    await handler({
      event_type: "subscription.active",
      data: {
        subscription_id: "sub_123",
        product_id: "pdt_subscription_starter",
        status: "active",
        customer: { customer_id: "cus_123" },
        metadata: { userId: "user-1", planKey: "starter" },
        previous_billing_date: "2026-04-01T00:00:00.000Z",
        next_billing_date: "2026-05-01T00:00:00.000Z",
        cancel_at_next_billing_date: false,
      },
    });

    expect(recordSubscriptionEvent).toHaveBeenCalledWith({
      userId: "user-1",
      providerSubscriptionId: "sub_123",
      eventType: "subscription.active",
      status: "active",
      payload: expect.any(Object),
    });
    expect(upsertUserSubscription).toHaveBeenCalledWith({
      userId: "user-1",
      planKey: "starter",
      providerCustomerId: "cus_123",
      providerSubscriptionId: "sub_123",
      dodoSubscriptionId: "sub_123",
      status: "active",
      currentPeriodStart: new Date("2026-04-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-05-01T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
    });
  });
});
