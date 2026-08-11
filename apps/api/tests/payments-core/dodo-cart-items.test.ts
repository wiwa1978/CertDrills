import { describe, expect, it } from "vitest";

import { createPaymentsModule, mapDodoEvent } from "@platform/payments-core";

describe("Dodo payment mapper", () => {
  it.each([
    "payment.succeeded",
    "payment.failed",
    "payment.processing",
  ] as const)("maps customer amounts for %s instead of settlement amounts", (eventType) => {
    expect(mapDodoEvent({
      id: `evt_${eventType}`,
      type: eventType,
      data: {
        payment_id: "pay_1",
        currency: "EUR",
        total_amount: 1210,
        tax: 210,
        settlement_currency: "USD",
        settlement_amount: 1300,
        settlement_tax: 300,
      },
    })).toEqual(expect.objectContaining({
      currency: "EUR",
      totalAmount: 1210,
      taxAmount: 210,
    }));
  });

  it.each([
    { billingMode: "credits", tax: null },
    { billingMode: "subscriptions", tax: undefined },
    { billingMode: "transactions", tax: null },
  ])("normalizes nullable zero tax for $billingMode without using settlement economics", ({ billingMode, tax }) => {
    const data: Record<string, unknown> = {
      payment_id: `pay_${billingMode}`,
      metadata: { billingMode },
      currency: "EUR",
      total_amount: 1000,
      settlement_currency: "USD",
      settlement_amount: 1200,
      settlement_tax: 200,
    };
    if (tax !== undefined) data.tax = tax;

    expect(mapDodoEvent({
      id: `evt_${billingMode}`,
      type: "payment.succeeded",
      data,
    })).toEqual(expect.objectContaining({
      metadata: { billingMode },
      currency: "EUR",
      totalAmount: 1000,
      taxAmount: 0,
    }));
  });

  it.each([
    "payment.succeeded",
    "payment.failed",
    "payment.processing",
  ] as const)("rejects %s without complete customer economics", (eventType) => {
    const customerEconomics = { currency: "EUR", total_amount: 1210 };

    for (const missingField of Object.keys(customerEconomics) as Array<keyof typeof customerEconomics>) {
      const data = {
        payment_id: "pay_1",
        ...customerEconomics,
        settlement_currency: "USD",
        settlement_amount: 1300,
        settlement_tax: 300,
      };
      delete data[missingField];

      expect(mapDodoEvent({ id: `evt_${eventType}_${missingField}`, type: eventType, data })).toBeNull();
    }
  });

  it("rejects settlement-only payment payloads at the webhook endpoint", async () => {
    const events: unknown[] = [];
    const module = createPaymentsModule({
      verifyDodoWebhook: () => true,
      onPaymentEvent: async (event) => {
        events.push(event);
      },
    });

    const response = await module.router.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": "test" },
      body: JSON.stringify({
        id: "evt_settlement_only",
        type: "payment.succeeded",
        data: {
          payment_id: "pay_1",
          settlement_currency: "EUR",
          settlement_amount: 1000,
          settlement_tax: 0,
        },
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { message: "Unsupported webhook payload" } });
    expect(events).toEqual([]);
  });

  it("maps payment product cart items through the webhook router", async () => {
    const events: unknown[] = [];
    const module = createPaymentsModule({
      verifyDodoWebhook: () => true,
      onPaymentEvent: async (event) => {
        events.push(event);
      },
    });

    const response = await module.router.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": "test" },
      body: JSON.stringify({
        id: "evt_1",
        type: "payment.succeeded",
        data: {
          payment_id: "pay_1",
          metadata: { billingMode: "transactions", userId: "user-1", orderId: "order-1" },
          product_cart: [
            { product_id: "pdt_basic", quantity: 2 },
            { product_id: "pdt_advanced", quantity: 1 },
          ],
          total_amount: 2000,
          tax: 0,
          currency: "EUR",
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(events[0]).toEqual(expect.objectContaining({
      productId: "pdt_basic",
      cartItems: [
        { productId: "pdt_basic", quantity: 2 },
        { productId: "pdt_advanced", quantity: 1 },
      ],
    }));
  });
});
