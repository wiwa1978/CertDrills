import { createHmac } from "node:crypto";

import { dodopayments } from "@dodopayments/better-auth";
import { betterAuth } from "better-auth";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import {
  createPaymentWebhookIngestion,
  createPaymentsModule,
  mapDodoEvent,
  type NormalizedPaymentEvent,
  type WebhookEventStore,
} from "@platform/payments-core";
import {
  createBetterAuthDodoWebhook,
  runWithBetterAuthWebhookContext,
} from "../../src/modules/payments/better-auth-webhook-context";

const payload = {
  id: "evt_bridge_1",
  type: "payment.succeeded",
  data: { payment_id: "pay_bridge_1" },
};

const BETTER_AUTH_WEBHOOK_SECRET = `whsec_${Buffer.from("better-auth-dodo-webhook-secret").toString("base64")}`;
const CUSTOM_WEBHOOK_SECRET = "custom-dodo-webhook-secret";

function dodoPaymentPayload(eventId: string) {
  return {
    id: eventId,
    business_id: "business_1",
    type: "payment.succeeded",
    timestamp: new Date().toISOString(),
    data: {
      payload_type: "Payment",
      billing: { city: null, country: "BE", state: null, street: null, zipcode: null },
      brand_id: "brand_1",
      business_id: "business_1",
      card_holder_name: null,
      card_issuing_country: null,
      card_last_four: null,
      card_network: null,
      card_type: null,
      checkout_session_id: null,
      created_at: new Date().toISOString(),
      currency: "EUR",
      custom_field_responses: null,
      customer: {
        customer_id: "customer_1",
        email: "buyer@example.com",
        metadata: {},
        name: "Buyer",
        phone_number: null,
      },
      digital_products_delivered: false,
      is_update_payment_method: false,
      discount_id: null,
      disputes: [],
      error_code: null,
      error_message: null,
      invoice_id: null,
      invoice_url: null,
      metadata: { userId: "user_1" },
      payment_id: "payment_1",
      payment_link: null,
      payment_provider: "dodo",
      payment_method: null,
      payment_method_type: null,
      product_cart: [{ product_id: "product_1", quantity: 1 }],
      refunds: [],
      retry_attempt: 0,
      refund_status: null,
      settlement_amount: 1000,
      settlement_currency: "EUR",
      settlement_tax: 0,
      status: "succeeded",
      subscription_id: null,
      tax: 0,
      total_amount: 1000,
      updated_at: null,
    },
  };
}

function createEndpointStore(): WebhookEventStore & {
  claim: ReturnType<typeof vi.fn>;
  markProcessed: ReturnType<typeof vi.fn>;
  markFailed: ReturnType<typeof vi.fn>;
} {
  const statuses = new Map<string, "processing" | "processed" | "failed">();
  return {
    claim: vi.fn(async ({ provider, providerEventId }) => {
      const key = `${provider}:${providerEventId}`;
      const status = statuses.get(key);
      if (status) return { claimed: false as const, status };
      statuses.set(key, "processing");
      return { claimed: true as const };
    }),
    markProcessed: vi.fn(async ({ provider, providerEventId }) => {
      statuses.set(`${provider}:${providerEventId}`, "processed");
    }),
    markFailed: vi.fn(async ({ provider, providerEventId }) => {
      statuses.set(`${provider}:${providerEventId}`, "failed");
    }),
  };
}

function betterAuthWebhookHeaders(body: string, eventId: string) {
  const timestamp = new Date();
  const timestampSeconds = Math.floor(timestamp.getTime() / 1000);
  const secret = Buffer.from(BETTER_AUTH_WEBHOOK_SECRET.slice("whsec_".length), "base64");
  const signature = createHmac("sha256", secret)
    .update(`${eventId}.${timestampSeconds}.${body}`)
    .digest("base64");
  return {
    "content-type": "application/json",
    "webhook-id": eventId,
    "webhook-timestamp": String(timestampSeconds),
    "webhook-signature": `v1,${signature}`,
  };
}

function customWebhookSignature(body: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", CUSTOM_WEBHOOK_SECRET)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function createEndpointHarness(onPaymentEvent: (event: NormalizedPaymentEvent) => Promise<void>) {
  const webhookEventStore = createEndpointStore();
  const ingestion = createPaymentWebhookIngestion({
    provider: "dodo",
    mapEvent: mapDodoEvent,
    webhookEventStore,
    onPaymentEvent,
  });
  const auth = betterAuth({
    baseURL: "http://localhost:3302/auth",
    secret: "test-better-auth-secret-with-enough-entropy-123456789",
    plugins: [
      dodopayments({
        client: {} as never,
        createCustomerOnSignUp: false,
        use: [createBetterAuthDodoWebhook(BETTER_AUTH_WEBHOOK_SECRET, ingestion)],
      }),
    ],
  });
  const customModule = createPaymentsModule({
    dodoWebhookSecret: CUSTOM_WEBHOOK_SECRET,
    webhookEventStore,
    onPaymentEvent,
  });
  const app = new Hono();
  app.use("/auth/dodopayments/webhooks", async (c, next) => {
    await runWithBetterAuthWebhookContext(c.req.raw.headers, "request-1", next);
  });
  app.on(["GET", "POST", "OPTIONS"], "/auth/*", (c) => auth.handler(c.req.raw));
  app.route("/payments", customModule.router);
  return { app, webhookEventStore };
}

function normalizedEvent(providerEventId: string = payload.id): NormalizedPaymentEvent {
  return {
    provider: "dodo",
    providerEventId,
    eventType: "payment.succeeded",
    paymentId: payload.data.payment_id,
    raw: payload,
  };
}

function createStore(claimed = true): WebhookEventStore {
  return {
    claim: vi.fn(async () => claimed
      ? { claimed: true as const }
      : { claimed: false as const, status: "processed" as const }),
    markProcessed: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
  };
}

describe("createPaymentWebhookIngestion", () => {
  it("maps, claims, handles, and marks a verified payload processed", async () => {
    const mapEvent = vi.fn(() => normalizedEvent());
    const webhookEventStore = createStore();
    const onPaymentEvent = vi.fn(async () => {});
    const signatureTimestamp = new Date("2026-08-04T12:00:00.000Z");
    const ingestion = createPaymentWebhookIngestion({
      provider: "dodo",
      mapEvent,
      webhookEventStore,
      onPaymentEvent,
    });

    await expect(ingestion.ingestVerifiedPayload(payload, {
      requestId: "request-1",
      correlationId: "correlation-1",
      signatureTimestamp,
    })).resolves.toEqual({ processed: true });

    expect(mapEvent).toHaveBeenCalledWith(payload);
    expect(webhookEventStore.claim).toHaveBeenCalledWith({
      provider: "dodo",
      providerEventId: "evt_bridge_1",
      eventType: "payment.succeeded",
      paymentId: "pay_bridge_1",
      signatureTimestamp,
      sanitizedPayload: payload,
      requestId: "request-1",
      correlationId: "correlation-1",
    });
    expect(onPaymentEvent).toHaveBeenCalledWith(normalizedEvent());
    expect(webhookEventStore.markProcessed).toHaveBeenCalledWith({
      provider: "dodo",
      providerEventId: "evt_bridge_1",
      durationMs: expect.any(Number),
    });
    expect(webhookEventStore.markFailed).not.toHaveBeenCalled();
  });

  it("returns duplicate state without invoking the payment handler", async () => {
    const webhookEventStore = createStore(false);
    const onPaymentEvent = vi.fn(async () => {});
    const ingestion = createPaymentWebhookIngestion({
      provider: "dodo",
      mapEvent: () => normalizedEvent(),
      webhookEventStore,
      onPaymentEvent,
    });

    await expect(ingestion.ingestVerifiedPayload(payload)).resolves.toEqual({
      processed: false,
      duplicate: true,
      status: "processed",
    });
    expect(onPaymentEvent).not.toHaveBeenCalled();
    expect(webhookEventStore.markProcessed).not.toHaveBeenCalled();
    expect(webhookEventStore.markFailed).not.toHaveBeenCalled();
  });

  it("marks and audits a claimed event when its handler fails", async () => {
    const handlerError = new Error("fulfillment failed");
    const webhookEventStore = createStore();
    const onWebhookFailure = vi.fn(async () => {});
    const ingestion = createPaymentWebhookIngestion({
      provider: "dodo",
      mapEvent: () => normalizedEvent(),
      webhookEventStore,
      onPaymentEvent: vi.fn(async () => {
        throw handlerError;
      }),
      onWebhookFailure,
    });

    await expect(ingestion.ingestVerifiedPayload(payload)).rejects.toBe(handlerError);
    expect(webhookEventStore.markProcessed).not.toHaveBeenCalled();
    expect(webhookEventStore.markFailed).toHaveBeenCalledWith({
      provider: "dodo",
      providerEventId: "evt_bridge_1",
      error: handlerError,
      durationMs: expect.any(Number),
    });
    expect(onWebhookFailure).toHaveBeenCalledWith({
      provider: "dodo",
      providerEventId: "evt_bridge_1",
      eventType: "payment.succeeded",
      paymentId: "pay_bridge_1",
      outcome: "failure",
      error: "handler_failed",
    });
  });

  it("rejects and audits mapped events without a provider event id", async () => {
    const webhookEventStore = createStore();
    const onPaymentEvent = vi.fn(async () => {});
    const onWebhookFailure = vi.fn(async () => {});
    const eventWithoutId = normalizedEvent();
    delete eventWithoutId.providerEventId;
    const ingestion = createPaymentWebhookIngestion({
      provider: "dodo",
      mapEvent: () => eventWithoutId,
      webhookEventStore,
      onPaymentEvent,
      onWebhookFailure,
    });

    await expect(ingestion.ingestVerifiedPayload(payload)).rejects.toThrow("Missing webhook event id");
    expect(webhookEventStore.claim).not.toHaveBeenCalled();
    expect(onPaymentEvent).not.toHaveBeenCalled();
    expect(onWebhookFailure).toHaveBeenCalledWith({
      provider: "dodo",
      providerEventId: null,
      eventType: "payment.succeeded",
      paymentId: "pay_bridge_1",
      outcome: "failure",
      error: "missing_event_id",
    });
  });
});

describe("Better Auth Dodo webhook endpoint bridge", () => {
  it("rejects unsigned webhook requests without returning 404", async () => {
    const onPaymentEvent = vi.fn(async () => {});
    const { app, webhookEventStore } = createEndpointHarness(onPaymentEvent);

    const response = await app.request("/auth/dodopayments/webhooks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(dodoPaymentPayload("event_unsigned")),
    });

    expect(response.status).not.toBe(404);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(onPaymentEvent).not.toHaveBeenCalled();
    expect(webhookEventStore.claim).not.toHaveBeenCalled();
  });

  it("processes the same provider event only once across Better Auth and custom endpoints", async () => {
    const onPaymentEvent = vi.fn(async () => {});
    const { app, webhookEventStore } = createEndpointHarness(onPaymentEvent);
    const eventId = "event_cross_route";
    const body = JSON.stringify(dodoPaymentPayload(eventId));

    const betterAuthResponse = await app.request("/auth/dodopayments/webhooks", {
      method: "POST",
      headers: betterAuthWebhookHeaders(body, eventId),
      body,
    });
    const customResponse = await app.request("/payments/webhooks/dodo", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-dodo-signature": customWebhookSignature(body),
      },
      body,
    });

    expect(betterAuthResponse.status).toBe(200);
    expect(customResponse.status).toBe(200);
    await expect(customResponse.json()).resolves.toMatchObject({
      success: true,
      data: { processed: false, duplicate: true, status: "processed" },
    });
    expect(webhookEventStore.claim).toHaveBeenCalledTimes(2);
    expect(webhookEventStore.markProcessed).toHaveBeenCalledTimes(1);
    expect(onPaymentEvent).toHaveBeenCalledTimes(1);
  });

  it("marks handler failures and returns non-2xx for Dodo retry", async () => {
    const handlerError = new Error("fulfillment failed");
    const onPaymentEvent = vi.fn(async () => {
      throw handlerError;
    });
    const { app, webhookEventStore } = createEndpointHarness(onPaymentEvent);
    const eventId = "event_handler_failure";
    const body = JSON.stringify(dodoPaymentPayload(eventId));

    const response = await app.request("/auth/dodopayments/webhooks", {
      method: "POST",
      headers: betterAuthWebhookHeaders(body, eventId),
      body,
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(webhookEventStore.markProcessed).not.toHaveBeenCalled();
    expect(webhookEventStore.markFailed).toHaveBeenCalledWith(expect.objectContaining({
      provider: "dodo",
      providerEventId: eventId,
      error: handlerError,
    }));
  });
});
