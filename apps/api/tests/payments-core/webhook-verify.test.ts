import { createHmac } from "node:crypto";

import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { createPaymentsModule } from "../../../../packages/payments-core/src/create-payments-module";
import {
  DODO_WEBHOOK_DEFAULT_TOLERANCE_SECONDS,
  type NormalizedPaymentEvent,
  verifyDodoWebhookSignatureDetailed,
} from "@platform/payments-core";

const SECRET = "whsec_test_dodo_super_secret_value";

function sign(body: string, timestampSeconds: number, secret = SECRET) {
  const signedPayload = `${timestampSeconds}.${body}`;
  const v1 = createHmac("sha256", secret).update(signedPayload).digest("hex");
  return { header: `t=${timestampSeconds},v1=${v1}`, v1 };
}

const samplePayload = JSON.stringify({
  id: "evt_test_123",
  type: "payment.succeeded",
  data: {
    payment_id: "pay_test_123",
    customer: { email: "buyer@example.com" },
    product_cart: [{ product_id: "prod_credits_100" }],
    metadata: { userId: "11111111-1111-1111-1111-111111111111" },
    settlement_amount: 1000,
    settlement_tax: 100,
    settlement_currency: "EUR",
  },
});

describe("verifyDodoWebhookSignatureDetailed", () => {
  const fixedNow = new Date("2026-04-24T12:00:00Z");
  const t = Math.floor(fixedNow.getTime() / 1000);

  it("missing_secret when secret is undefined", () => {
    const r = verifyDodoWebhookSignatureDetailed("body", "t=1,v1=x", undefined);
    expect(r).toEqual({ ok: false, reason: "missing_secret" });
  });

  it("missing_header when no signature header", () => {
    const r = verifyDodoWebhookSignatureDetailed("body", null, SECRET);
    expect(r).toEqual({ ok: false, reason: "missing_header" });
  });

  it("malformed_header when header lacks t/v1", () => {
    const r = verifyDodoWebhookSignatureDetailed("body", "garbage", SECRET);
    expect(r).toEqual({ ok: false, reason: "malformed_header" });
  });

  it("malformed_header when timestamp is not a number", () => {
    const r = verifyDodoWebhookSignatureDetailed("body", "t=NaN,v1=abc", SECRET);
    expect(r).toEqual({ ok: false, reason: "malformed_header" });
  });

  it("timestamp_out_of_window when older than tolerance", () => {
    const stale = t - DODO_WEBHOOK_DEFAULT_TOLERANCE_SECONDS - 1;
    const { header } = sign(samplePayload, stale);
    const r = verifyDodoWebhookSignatureDetailed(samplePayload, header, SECRET, {
      now: () => fixedNow,
    });
    expect(r).toEqual({ ok: false, reason: "timestamp_out_of_window" });
  });

  it("timestamp_out_of_window when too far in the future", () => {
    const future = t + DODO_WEBHOOK_DEFAULT_TOLERANCE_SECONDS + 1;
    const { header } = sign(samplePayload, future);
    const r = verifyDodoWebhookSignatureDetailed(samplePayload, header, SECRET, {
      now: () => fixedNow,
    });
    expect(r).toEqual({ ok: false, reason: "timestamp_out_of_window" });
  });

  it("signature_mismatch when body has been tampered with", () => {
    const { header } = sign(samplePayload, t);
    const r = verifyDodoWebhookSignatureDetailed(
      samplePayload + "x",
      header,
      SECRET,
      { now: () => fixedNow },
    );
    expect(r).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("signature_mismatch when secret has been rotated", () => {
    const { header } = sign(samplePayload, t, "wrong-secret");
    const r = verifyDodoWebhookSignatureDetailed(samplePayload, header, SECRET, {
      now: () => fixedNow,
    });
    expect(r).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("ok for a correctly signed, in-window payload", () => {
    const { header } = sign(samplePayload, t);
    const r = verifyDodoWebhookSignatureDetailed(samplePayload, header, SECRET, {
      now: () => fixedNow,
    });
    expect(r).toEqual({ ok: true });
  });

  it("rejects a previously-valid header replayed long after the fact", () => {
    const { header } = sign(samplePayload, t);
    const muchLater = new Date(fixedNow.getTime() + 24 * 60 * 60 * 1000);
    const r = verifyDodoWebhookSignatureDetailed(samplePayload, header, SECRET, {
      now: () => muchLater,
    });
    expect(r).toEqual({ ok: false, reason: "timestamp_out_of_window" });
  });
});

describe("POST /webhooks/dodo response codes", () => {
  function build(opts?: Partial<Parameters<typeof createPaymentsModule>[0]>) {
    const onPaymentEvent =
      opts?.onPaymentEvent ??
      vi.fn<(event: NormalizedPaymentEvent) => Promise<void>>(async () => {});
    const module = createPaymentsModule({
      dodoWebhookSecret: SECRET,
      onPaymentEvent,
      ...opts,
    });
    const app = new Hono();
    app.onError((_, c) => c.text("Internal Server Error", 500));
    app.route("/", module.router);
    return { app, onPaymentEvent };
  }

  it("401 WEBHOOK_SIGNATURE_MISSING with no header", async () => {
    const { app, onPaymentEvent } = build();
    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      body: samplePayload,
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      success: false,
      error: { code: "WEBHOOK_SIGNATURE_MISSING" },
    });
    expect(onPaymentEvent).not.toHaveBeenCalled();
  });

  it("404 rejects unsupported webhook providers before verification", async () => {
    const { app, onPaymentEvent } = build();
    const res = await app.request("/webhooks/stripe", {
      method: "POST",
      body: samplePayload,
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: { code: "NOT_FOUND", message: "Unsupported payment provider" } });
    expect(onPaymentEvent).not.toHaveBeenCalled();
  });

  it("401 reports only unauthenticated-safe webhook failure metadata when signature header is missing", async () => {
    const onWebhookFailure = vi.fn(async () => {});
    const { app, onPaymentEvent } = build({ onWebhookFailure });
    const payload = JSON.stringify({
      id: "evt_signature_1",
      type: "payment.succeeded",
      data: { payment_id: "pay_signature_1", token: "abc.def.ghi" },
    });

    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      body: payload,
    });

    expect(res.status).toBe(401);
    expect(onPaymentEvent).not.toHaveBeenCalled();
    expect(onWebhookFailure).toHaveBeenCalledWith({
      provider: "dodo",
      providerEventId: null,
      eventType: null,
      paymentId: null,
      outcome: "failure",
      error: "missing_header",
    });
    expect(JSON.stringify(onWebhookFailure.mock.calls[0]?.[0])).not.toContain("evt_signature_1");
    expect(JSON.stringify(onWebhookFailure.mock.calls[0]?.[0])).not.toContain("pay_signature_1");
    expect(JSON.stringify(onWebhookFailure.mock.calls[0]?.[0])).not.toContain("abc.def.ghi");
  });

  it("401 reports only unauthenticated-safe webhook failure metadata when signature is invalid", async () => {
    const onWebhookFailure = vi.fn(async () => {});
    const { app, onPaymentEvent } = build({ onWebhookFailure });
    const legitimatePayload = JSON.stringify({ id: "evt_legitimate", type: "payment.succeeded" });
    const t = Math.floor(Date.now() / 1000);
    const { header } = sign(legitimatePayload, t);
    const maliciousPayload = JSON.stringify({
      id: "evt_attacker_chosen",
      type: "payment.failed",
      data: { payment_id: "pay_attacker_chosen", token: "abc.def.ghi" },
    });

    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": header },
      body: maliciousPayload,
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      success: false,
      error: { code: "WEBHOOK_SIGNATURE_INVALID" },
    });
    expect(onPaymentEvent).not.toHaveBeenCalled();
    expect(onWebhookFailure).toHaveBeenCalledWith({
      provider: "dodo",
      providerEventId: null,
      eventType: null,
      paymentId: null,
      outcome: "failure",
      error: "signature_mismatch",
    });
    const auditPayload = JSON.stringify(onWebhookFailure.mock.calls[0]?.[0]);
    expect(auditPayload).not.toContain("evt_attacker_chosen");
    expect(auditPayload).not.toContain("payment.failed");
    expect(auditPayload).not.toContain("pay_attacker_chosen");
    expect(auditPayload).not.toContain("abc.def.ghi");
  });

  it("401 WEBHOOK_SIGNATURE_INVALID with malformed header", async () => {
    const { app, onPaymentEvent } = build();
    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": "garbage" },
      body: samplePayload,
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      success: false,
      error: { code: "WEBHOOK_SIGNATURE_INVALID" },
    });
    expect(onPaymentEvent).not.toHaveBeenCalled();
  });

  it("401 WEBHOOK_TIMESTAMP_OUT_OF_WINDOW for a stale payload", async () => {
    const { app, onPaymentEvent } = build();
    const stale = Math.floor(Date.now() / 1000) - 60 * 60; // 1 hour ago
    const { header } = sign(samplePayload, stale);
    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": header },
      body: samplePayload,
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      success: false,
      error: { code: "WEBHOOK_TIMESTAMP_OUT_OF_WINDOW" },
    });
    expect(onPaymentEvent).not.toHaveBeenCalled();
  });

  it("401 WEBHOOK_SIGNATURE_INVALID when body bytes differ from signed payload", async () => {
    const { app, onPaymentEvent } = build();
    const t = Math.floor(Date.now() / 1000);
    const { header } = sign(samplePayload, t);
    const tampered = samplePayload.replace("1000", "999999");
    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": header },
      body: tampered,
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      success: false,
      error: { code: "WEBHOOK_SIGNATURE_INVALID" },
    });
    expect(onPaymentEvent).not.toHaveBeenCalled();
  });

  it("200 invokes onPaymentEvent for a valid signed payload", async () => {
    const { app, onPaymentEvent } = build();
    const t = Math.floor(Date.now() / 1000);
    const { header } = sign(samplePayload, t);
    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": header },
      body: samplePayload,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });
    expect(onPaymentEvent).toHaveBeenCalledOnce();
    const firstCall = onPaymentEvent.mock.calls[0];
    expect(firstCall?.[0]).toMatchObject({
      provider: "dodo",
      providerEventId: "evt_test_123",
      eventType: "payment.succeeded",
      paymentId: "pay_test_123",
    });
  });

  it("200 normalizes failed payment payloads with checkout metadata", async () => {
    const failedPayload = JSON.stringify({
      id: "evt_failed_123",
      type: "payment.failed",
      data: {
        payment_id: "pay_failed_123",
        customer: { email: "buyer@example.com", customer_id: "cus_failed" },
        product_cart: [{ product_id: "prod_credits_100" }],
        metadata: { userId: "11111111-1111-1111-1111-111111111111" },
        settlement_amount: 1000,
        settlement_tax: 100,
        settlement_currency: "EUR",
      },
    });
    const { app, onPaymentEvent } = build();
    const t = Math.floor(Date.now() / 1000);
    const { header } = sign(failedPayload, t);

    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": header },
      body: failedPayload,
    });

    expect(res.status).toBe(200);
    expect(onPaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "dodo",
        providerEventId: "evt_failed_123",
        eventType: "payment.failed",
        paymentId: "pay_failed_123",
        customerId: "cus_failed",
        productId: "prod_credits_100",
        metadata: { userId: "11111111-1111-1111-1111-111111111111" },
        currency: "EUR",
        totalAmount: 1000,
        taxAmount: 100,
      }),
    );
  });

  it("200 normalizes processing payment payloads with checkout metadata", async () => {
    const processingPayload = JSON.stringify({
      id: "evt_processing_123",
      type: "payment.processing",
      data: {
        payment_id: "pay_processing_123",
        customer: { email: "buyer@example.com", customer_id: "cus_processing" },
        product_cart: [{ product_id: "prod_credits_100" }],
        metadata: { userId: "11111111-1111-1111-1111-111111111111" },
        settlement_amount: 1000,
        settlement_tax: 100,
        settlement_currency: "EUR",
      },
    });
    const { app, onPaymentEvent } = build();
    const t = Math.floor(Date.now() / 1000);
    const { header } = sign(processingPayload, t);

    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": header },
      body: processingPayload,
    });

    expect(res.status).toBe(200);
    expect(onPaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "dodo",
        providerEventId: "evt_processing_123",
        eventType: "payment.processing",
        paymentId: "pay_processing_123",
        customerId: "cus_processing",
        productId: "prod_credits_100",
        metadata: { userId: "11111111-1111-1111-1111-111111111111" },
        currency: "EUR",
        totalAmount: 1000,
        taxAmount: 100,
      }),
    );
  });

  it("200 normalizes full refund payloads", async () => {
    const refundPayload = JSON.stringify({
      id: "evt_refund_123",
      type: "refund.succeeded",
      data: {
        payload_type: "Refund",
        payment_id: "pay_refunded_123",
        refund_id: "rfnd_123",
        is_partial: false,
        customer: { email: "buyer@example.com", customer_id: "cus_refund" },
        metadata: { userId: "11111111-1111-1111-1111-111111111111" },
        amount: 1000,
        currency: "EUR",
      },
    });
    const { app, onPaymentEvent } = build();
    const t = Math.floor(Date.now() / 1000);
    const { header } = sign(refundPayload, t);

    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": header },
      body: refundPayload,
    });

    expect(res.status).toBe(200);
    expect(onPaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "dodo",
        providerEventId: "evt_refund_123",
        eventType: "refund.succeeded",
        paymentId: "pay_refunded_123",
        refundId: "rfnd_123",
        refundIsPartial: false,
        customerId: "cus_refund",
        metadata: { userId: "11111111-1111-1111-1111-111111111111" },
        currency: "EUR",
        totalAmount: 1000,
      }),
    );
  });

  it("200 normalizes dispute loss payloads", async () => {
    const disputePayload = JSON.stringify({
      id: "evt_dispute_123",
      type: "dispute.lost",
      data: {
        payload_type: "Dispute",
        payment_id: "pay_disputed_123",
        dispute_id: "disp_123",
        dispute_status: "dispute_lost",
        customer: { email: "buyer@example.com", customer_id: "cus_dispute" },
        amount: "1000",
        currency: "EUR",
      },
    });
    const { app, onPaymentEvent } = build();
    const t = Math.floor(Date.now() / 1000);
    const { header } = sign(disputePayload, t);

    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": header },
      body: disputePayload,
    });

    expect(res.status).toBe(200);
    expect(onPaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "dodo",
        providerEventId: "evt_dispute_123",
        eventType: "dispute.lost",
        paymentId: "pay_disputed_123",
        disputeId: "disp_123",
        disputeStatus: "dispute_lost",
        customerId: "cus_dispute",
        currency: "EUR",
        totalAmount: 1000,
      }),
    );
  });

  it("200 skips duplicate events already recorded as processed", async () => {
    const store = {
      claim: vi.fn(async () => ({ claimed: false as const, status: "processed" as const })),
      markProcessed: vi.fn(async () => {}),
      markFailed: vi.fn(async () => {}),
    };
    const { app, onPaymentEvent } = build({ webhookEventStore: store });
    const t = Math.floor(Date.now() / 1000);
    const { header } = sign(samplePayload, t);

    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": header },
      body: samplePayload,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, data: { processed: false, duplicate: true, status: "processed" } });
    expect(store.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "dodo",
        providerEventId: "evt_test_123",
        eventType: "payment.succeeded",
        paymentId: "pay_test_123",
      }),
    );
    expect(onPaymentEvent).not.toHaveBeenCalled();
    expect(store.markProcessed).not.toHaveBeenCalled();
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it("passes webhook observability fields to the event store", async () => {
    const store = {
      claim: vi.fn(async () => ({ claimed: true as const })),
      markProcessed: vi.fn(async () => {}),
      markFailed: vi.fn(async () => {}),
    };
    const { app } = build({ webhookEventStore: store });
    const t = Math.floor(Date.now() / 1000);
    const { header } = sign(samplePayload, t);

    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": header, "x-request-id": "req_123", "x-correlation-id": "corr_123" },
      body: samplePayload,
    });

    expect(res.status).toBe(200);
    expect(store.claim).toHaveBeenCalledWith(expect.objectContaining({
      providerEventId: "evt_test_123",
      requestId: "req_123",
      correlationId: "corr_123",
      sanitizedPayload: JSON.parse(samplePayload),
    }));
    expect(store.markProcessed).toHaveBeenCalledWith(expect.objectContaining({
      providerEventId: "evt_test_123",
      durationMs: expect.any(Number),
    }));
  });

  it("400 rejects DB-backed webhook processing without a provider event id", async () => {
    const store = {
      claim: vi.fn(async () => ({ claimed: true as const })),
      markProcessed: vi.fn(async () => {}),
      markFailed: vi.fn(async () => {}),
    };
    const { app, onPaymentEvent } = build({ webhookEventStore: store });
    const payloadWithoutEventId = JSON.stringify({
      type: "payment.succeeded",
      data: {
        payment_id: "pay_without_event_id",
        customer: { email: "buyer@example.com" },
        product_cart: [{ product_id: "prod_credits_100" }],
        metadata: { userId: "11111111-1111-1111-1111-111111111111" },
      },
    });
    const t = Math.floor(Date.now() / 1000);
    const { header } = sign(payloadWithoutEventId, t);

    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": header },
      body: payloadWithoutEventId,
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, error: { code: "BAD_REQUEST", message: "Missing webhook event id" } });
    expect(store.claim).not.toHaveBeenCalled();
    expect(onPaymentEvent).not.toHaveBeenCalled();
  });

  it("400 reports safe webhook failure metadata for invalid JSON", async () => {
    const onWebhookFailure = vi.fn(async () => {});
    const { app, onPaymentEvent } = build({ onWebhookFailure });
    const invalidPayload = '{"id":"evt_bad_json","token":"abc.def.ghi"';
    const t = Math.floor(Date.now() / 1000);
    const { header } = sign(invalidPayload, t);

    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": header },
      body: invalidPayload,
    });

    expect(res.status).toBe(400);
    expect(onPaymentEvent).not.toHaveBeenCalled();
    expect(onWebhookFailure).toHaveBeenCalledWith({
      provider: "dodo",
      providerEventId: null,
      eventType: null,
      paymentId: null,
      outcome: "failure",
      error: "invalid_json",
    });
    expect(JSON.stringify(onWebhookFailure.mock.calls[0]?.[0])).not.toContain("abc.def.ghi");
  });

  it("400 reports safe webhook failure metadata when DB-backed event id is missing", async () => {
    const store = {
      claim: vi.fn(async () => ({ claimed: true as const })),
      markProcessed: vi.fn(async () => {}),
      markFailed: vi.fn(async () => {}),
    };
    const onWebhookFailure = vi.fn(async () => {});
    const { app, onPaymentEvent } = build({ webhookEventStore: store, onWebhookFailure });
    const payloadWithoutEventId = JSON.stringify({
      type: "payment.succeeded",
      data: {
        payment_id: "pay_without_event_id",
        customer: { email: "buyer@example.com" },
        product_cart: [{ product_id: "prod_credits_100" }],
        metadata: { userId: "11111111-1111-1111-1111-111111111111" },
      },
    });
    const t = Math.floor(Date.now() / 1000);
    const { header } = sign(payloadWithoutEventId, t);

    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": header },
      body: payloadWithoutEventId,
    });

    expect(res.status).toBe(400);
    expect(store.claim).not.toHaveBeenCalled();
    expect(onPaymentEvent).not.toHaveBeenCalled();
    expect(onWebhookFailure).toHaveBeenCalledWith({
      provider: "dodo",
      providerEventId: null,
      eventType: "payment.succeeded",
      paymentId: "pay_without_event_id",
      outcome: "failure",
      error: "missing_event_id",
    });
  });

  it("marks claimed events processed after handler success", async () => {
    const store = {
      claim: vi.fn(async () => ({ claimed: true as const })),
      markProcessed: vi.fn(async () => {}),
      markFailed: vi.fn(async () => {}),
    };
    const { app, onPaymentEvent } = build({ webhookEventStore: store });
    const t = Math.floor(Date.now() / 1000);
    const { header } = sign(samplePayload, t);

    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": header },
      body: samplePayload,
    });

    expect(res.status).toBe(200);
    expect(onPaymentEvent).toHaveBeenCalledOnce();
    expect(store.markProcessed).toHaveBeenCalledWith(expect.objectContaining({
      provider: "dodo",
      providerEventId: "evt_test_123",
      durationMs: expect.any(Number),
    }));
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it("marks claimed events failed when handler throws", async () => {
    const handlerError = new Error("boom");
    const store = {
      claim: vi.fn(async () => ({ claimed: true as const })),
      markProcessed: vi.fn(async () => {}),
      markFailed: vi.fn(async () => {}),
    };
    const { app, onPaymentEvent } = build({
      webhookEventStore: store,
      onPaymentEvent: vi.fn(async () => {
        throw handlerError;
      }),
    });
    const t = Math.floor(Date.now() / 1000);
    const { header } = sign(samplePayload, t);

    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": header },
      body: samplePayload,
    });

    expect(res.status).toBe(500);
    expect(onPaymentEvent).toHaveBeenCalledOnce();
    expect(store.markProcessed).not.toHaveBeenCalled();
    expect(store.markFailed).toHaveBeenCalledWith(expect.objectContaining({
      provider: "dodo",
      providerEventId: "evt_test_123",
      error: handlerError,
      durationMs: expect.any(Number),
    }));
  });

  it("500 reports safe webhook failure metadata when handler throws", async () => {
    const payload = JSON.stringify({
      type: "payment.succeeded",
      id: "evt_1",
      data: {
        payment_id: "pay_1",
        customer: { email: "buyer@example.com" },
        token: "secret-value",
      },
    });
    const onWebhookFailure = vi.fn(async () => {});
    const { app } = build({
      onPaymentEvent: vi.fn(async () => {
        throw new Error(`handler failed with payload ${payload}`);
      }),
      onWebhookFailure,
    });
    const t = Math.floor(Date.now() / 1000);
    const { header } = sign(payload, t);

    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": header },
      body: payload,
    });

    expect(res.status).toBe(500);
    expect(onWebhookFailure).toHaveBeenCalledOnce();
    expect(onWebhookFailure).toHaveBeenCalledWith({
      provider: "dodo",
      providerEventId: "evt_1",
      eventType: "payment.succeeded",
      paymentId: "pay_1",
      outcome: "failure",
      error: "handler_failed",
    });
    const auditPayload = JSON.stringify(onWebhookFailure.mock.calls[0]?.[0]);
    expect(auditPayload).not.toContain("secret-value");
    expect(auditPayload).not.toContain("buyer@example.com");
    expect(auditPayload).not.toContain(payload);
  });

  it("does not let webhook failure callback errors mask response behavior", async () => {
    const { app } = build({
      onPaymentEvent: vi.fn(async () => {
        throw new Error("handler failed");
      }),
      onWebhookFailure: vi.fn(async () => {
        throw new Error("audit failed");
      }),
    });
    const t = Math.floor(Date.now() / 1000);
    const { header } = sign(samplePayload, t);

    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": header },
      body: samplePayload,
    });

    expect(res.status).toBe(500);
  });

  it("legacy boolean-returning verifier still works (backward compat)", async () => {
    const { app } = build({
      verifyDodoWebhook: () => true,
    });
    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": "anything" },
      body: samplePayload,
    });
    expect(res.status).toBe(200);
  });
});
