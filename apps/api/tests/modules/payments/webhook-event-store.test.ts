import { describe, expect, it, vi } from "vitest";

import { paymentWebhookEvents } from "@platform/platform-db";

import { createPaymentWebhookEventStore } from "../../../src/modules/payments/webhook-event-store";

describe("createPaymentWebhookEventStore", () => {
  it("claims new webhook events", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "row-1" }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const db = {
      insert: vi.fn().mockReturnValue({ values }),
    };
    const store = createPaymentWebhookEventStore({ db } as any);

    const result = await store.claim({
      provider: "dodo",
      providerEventId: "evt_1",
      eventType: "payment.succeeded",
      paymentId: "pay_1",
      signatureTimestamp: new Date("2026-04-26T12:00:00Z"),
      sanitizedPayload: { id: "evt_1", data: { payment_id: "pay_1" } },
      requestId: "req_1",
      correlationId: "corr_1",
    });

    expect(result).toEqual({ claimed: true });
    expect(db.insert).toHaveBeenCalledWith(paymentWebhookEvents);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      provider: "dodo",
      providerEventId: "evt_1",
      processingStatus: "processing",
      sanitizedPayload: { id: "evt_1", data: { payment_id: "pay_1" } },
      requestId: "req_1",
      correlationId: "corr_1",
    }));
    expect(onConflictDoNothing).toHaveBeenCalledWith({
      target: [paymentWebhookEvents.provider, paymentWebhookEvents.providerEventId],
    });
  });

  it("does not claim already processed events", async () => {
    const db = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      query: {
        paymentWebhookEvents: {
          findFirst: vi.fn().mockResolvedValue({ processingStatus: "processed" }),
        },
      },
      update: vi.fn(),
    };
    const store = createPaymentWebhookEventStore({ db } as any);

    await expect(
      store.claim({ provider: "dodo", providerEventId: "evt_1", eventType: "payment.succeeded", paymentId: "pay_1" }),
    ).resolves.toEqual({ claimed: false, status: "processed" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("reclaims failed events for retry", async () => {
    const updateReturning = vi.fn().mockResolvedValue([{ id: "row-1" }]);
    const db = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      query: {
        paymentWebhookEvents: {
          findFirst: vi.fn().mockResolvedValue({ processingStatus: "failed" }),
        },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ returning: updateReturning }),
        }),
      }),
    };
    const store = createPaymentWebhookEventStore({ db } as any);

    await expect(
      store.claim({
        provider: "dodo",
        providerEventId: "evt_1",
        eventType: "payment.succeeded",
        paymentId: "pay_1",
        sanitizedPayload: { id: "evt_1" },
        requestId: "req_2",
        correlationId: "corr_2",
      }),
    ).resolves.toEqual({ claimed: true });
    expect(db.update).toHaveBeenCalledWith(paymentWebhookEvents);
    expect(db.update().set).toHaveBeenCalledWith(expect.objectContaining({
      sanitizedPayload: { id: "evt_1" },
      requestId: "req_2",
      correlationId: "corr_2",
      durationMs: null,
    }));
  });

  it("marks processed events with duration", async () => {
    const set = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const db = {
      update: vi.fn().mockReturnValue({ set }),
    };
    const store = createPaymentWebhookEventStore({ db } as any);

    await store.markProcessed({ provider: "dodo", providerEventId: "evt_1", durationMs: 42 });

    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      processingStatus: "processed",
      durationMs: 42,
    }));
  });

  it("marks failed events with sanitized error details and duration", async () => {
    const set = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const db = {
      update: vi.fn().mockReturnValue({ set }),
    };
    const store = createPaymentWebhookEventStore({ db } as any);
    const error = new Error("provider exploded");
    error.stack = "Error: provider exploded\n    at handler (/app/src/payment.ts:10:5)";
    (error as Error & { code: string; status: number; secret: string }).code = "provider_error";
    (error as Error & { code: string; status: number; secret: string }).status = 503;
    (error as Error & { code: string; status: number; secret: string }).secret = "sk_live_secret";

    await store.markFailed({ provider: "dodo", providerEventId: "evt_1", error, durationMs: 87 });

    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      processingStatus: "failed",
      durationMs: 87,
      errorDetails: {
        name: "Error",
        message: "provider exploded",
        code: "provider_error",
        status: 503,
        stack: "Error: provider exploded\n    at handler (/app/src/payment.ts:10:5)",
      },
    }));
  });

  it("sanitizes sensitive payload fields before storage", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "row-1" }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const db = {
      insert: vi.fn().mockReturnValue({ values }),
    };
    const store = createPaymentWebhookEventStore({ db } as any);

    await store.claim({
      provider: "dodo",
      providerEventId: "evt_1",
      eventType: "payment.succeeded",
      paymentId: "pay_1",
      sanitizedPayload: {
        id: "evt_1",
        customer_email: "buyer@example.com",
        token: "tok_secret",
        nested: { authorization: "Bearer secret", keep: "safe" },
      },
    });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      sanitizedPayload: {
        id: "evt_1",
        customer_email: "[redacted]",
        token: "[redacted]",
        nested: { authorization: "[redacted]", keep: "safe" },
      },
    }));
  });
});
