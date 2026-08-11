import { Hono } from "hono";

import { errorCode } from "@platform/contracts";

import { mapDodoEvent } from "./providers/dodo/mapper";
import { verifyDodoWebhookSignatureDetailed } from "./providers/dodo/webhook-verify";
import type {
  CreatePaymentsModuleOptions,
  CreatePaymentWebhookIngestionOptions,
  PaymentWebhookIngestion,
  PaymentWebhookProviderConfig,
  WebhookFailureAuditEvent,
} from "./types";
import type { WebhookVerifyResult } from "./types";

type SafeWebhookMetadata = Pick<WebhookFailureAuditEvent, "providerEventId" | "eventType" | "paymentId">;
type PaymentWebhookDispatcher = Omit<PaymentWebhookProviderConfig, "verify"> & {
  verify?: PaymentWebhookProviderConfig["verify"];
};

const UNAUTHENTICATED_WEBHOOK_METADATA: SafeWebhookMetadata = {
  providerEventId: null,
  eventType: null,
  paymentId: null,
};

type SafeWebhookFailureError =
  | Exclude<WebhookVerifyResult, { ok: true }>["reason"]
  | "invalid_json"
  | "unsupported_event"
  | "missing_event_id"
  | "handler_failed";

class PaymentWebhookIngestionError extends Error {
  constructor(readonly reason: "unsupported_event" | "missing_event_id", message: string) {
    super(message);
    this.name = "PaymentWebhookIngestionError";
  }
}

function failureToResponse(reason: Exclude<WebhookVerifyResult, { ok: true }>["reason"]) {
  switch (reason) {
    case "missing_header":
      return {
        status: 401 as const,
        body: {
          success: false as const,
          error: {
            code: errorCode.webhookSignatureMissing,
            message: "Missing webhook signature header",
          },
        },
      };
    case "missing_secret":
      // Misconfiguration on our side. Surface as 500-class to operators but
      // do not leak details to the caller.
      return {
        status: 500 as const,
        body: {
          success: false as const,
          error: {
            code: errorCode.webhookSignatureMissing,
            message: "Webhook secret not configured",
          },
        },
      };
    case "timestamp_out_of_window":
      return {
        status: 401 as const,
        body: {
          success: false as const,
          error: {
            code: errorCode.webhookTimestampOutOfWindow,
            message: "Webhook timestamp outside tolerance window",
          },
        },
      };
    case "malformed_header":
    case "signature_mismatch":
    default:
      return {
        status: 401 as const,
        body: {
          success: false as const,
          error: {
            code: errorCode.webhookSignatureInvalid,
            message: "Invalid webhook signature",
          },
        },
      };
  }
}

function signatureTimestamp(signatureHeader: string | null) {
  const timestamp = signatureHeader
    ?.split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith("t="))
    ?.slice(2);

  if (!timestamp) {
    return undefined;
  }

  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(timestampSeconds)) {
    return undefined;
  }

  return new Date(timestampSeconds * 1000);
}

function extractSafeWebhookMetadata(payload: unknown): SafeWebhookMetadata {
  if (!payload || typeof payload !== "object") {
    return UNAUTHENTICATED_WEBHOOK_METADATA;
  }

  const record = payload as Record<string, unknown>;
  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : undefined;
  return {
    providerEventId: typeof record.id === "string" ? record.id : typeof record.event_id === "string" ? record.event_id : null,
    eventType: typeof record.type === "string" ? record.type : null,
    paymentId: typeof data?.payment_id === "string" ? data.payment_id : null,
  };
}

function contextRequestId(c: unknown) {
  const value = (c as { get?: (key: string) => unknown }).get?.("requestId");
  return typeof value === "string" ? value : undefined;
}

function paymentWebhookDispatchers(options: CreatePaymentsModuleOptions): PaymentWebhookDispatcher[] {
  return [{
    provider: "dodo",
    signatureHeaderName: "x-dodo-signature",
    secret: options.dodoWebhookSecret,
    toleranceSeconds: options.dodoWebhookToleranceSeconds,
    verify: options.verifyDodoWebhook,
    mapEvent: mapDodoEvent,
  }, ...(options.webhookProviders ?? [])];
}

function paymentWebhookDispatcherForProvider(provider: string, options: CreatePaymentsModuleOptions): PaymentWebhookDispatcher | null {
  return paymentWebhookDispatchers(options).find((dispatcher) => dispatcher.provider === provider) ?? null;
}

async function verifyWebhookSignature(dispatcher: PaymentWebhookDispatcher, rawBody: string, signatureHeader: string | null): Promise<WebhookVerifyResult> {
  if (!dispatcher.verify && dispatcher.provider !== "dodo") {
    return { ok: false, reason: "missing_secret" };
  }

  const result = dispatcher.verify
    ? await dispatcher.verify(rawBody, signatureHeader)
    : verifyDodoWebhookSignatureDetailed(rawBody, signatureHeader, dispatcher.secret, { toleranceSeconds: dispatcher.toleranceSeconds });

  // Allow boolean returns from custom verifiers for backward compat.
  if (typeof result === "boolean") {
    return result
      ? ({ ok: true } as const)
      : ({ ok: false, reason: "signature_mismatch" } as const);
  }

  return result;
}

async function recordWebhookFailure(
  onWebhookFailure: CreatePaymentsModuleOptions["onWebhookFailure"],
  provider: string,
  metadata: SafeWebhookMetadata,
  error: SafeWebhookFailureError,
) {
  try {
    await onWebhookFailure?.({
      provider,
      providerEventId: metadata.providerEventId ?? null,
      eventType: metadata.eventType ?? null,
      paymentId: metadata.paymentId ?? null,
      outcome: "failure",
      error,
    });
  } catch {
    // Webhook failure auditing is best-effort and must not alter webhook responses.
  }
}

export function createPaymentWebhookIngestion(
  options: CreatePaymentWebhookIngestionOptions,
): PaymentWebhookIngestion {
  return {
    async ingestVerifiedPayload(payload, context = {}) {
      const startedAt = Date.now();
      const event = options.mapEvent(payload);
      if (!event) {
        await recordWebhookFailure(
          options.onWebhookFailure,
          options.provider,
          extractSafeWebhookMetadata(payload),
          "unsupported_event",
        );
        throw new PaymentWebhookIngestionError("unsupported_event", "Unsupported webhook payload");
      }

      const providerEventId = event.providerEventId;
      if (!providerEventId) {
        await recordWebhookFailure(options.onWebhookFailure, options.provider, event, "missing_event_id");
        throw new PaymentWebhookIngestionError("missing_event_id", "Missing webhook event id");
      }

      if (options.webhookEventStore) {
        const claim = await options.webhookEventStore.claim({
          provider: options.provider,
          providerEventId,
          eventType: event.eventType,
          paymentId: event.paymentId,
          signatureTimestamp: context.signatureTimestamp,
          sanitizedPayload: payload,
          requestId: context.requestId,
          correlationId: context.correlationId,
        });

        if (!claim.claimed) {
          return { processed: false, duplicate: true, status: claim.status };
        }
      }

      try {
        await options.onPaymentEvent(event);
        await options.webhookEventStore?.markProcessed({
          provider: options.provider,
          providerEventId,
          durationMs: Date.now() - startedAt,
        });
        return { processed: true };
      } catch (error) {
        await options.webhookEventStore?.markFailed({
          provider: options.provider,
          providerEventId,
          error,
          durationMs: Date.now() - startedAt,
        });
        await recordWebhookFailure(options.onWebhookFailure, options.provider, event, "handler_failed");
        throw error;
      }
    },
  };
}

export function createPaymentsModule(options: CreatePaymentsModuleOptions) {
  const router = new Hono();

  router.post("/webhooks/:provider", async (c) => {
    const provider = c.req.param("provider");
    const dispatcher = paymentWebhookDispatcherForProvider(provider, options);
    if (!dispatcher) {
      return c.json({ success: false, error: { code: errorCode.notFound, message: "Unsupported payment provider" } }, 404);
    }

    const signatureHeader = c.req.header(dispatcher.signatureHeaderName) ?? null;
    const requestId = contextRequestId(c) ?? c.req.header("x-request-id") ?? null;
    const correlationId = c.req.header("x-correlation-id") ?? requestId;
    const rawBody = await c.req.text();

    const verification = await verifyWebhookSignature(dispatcher, rawBody, signatureHeader);

    if (!verification.ok) {
      await recordWebhookFailure(options.onWebhookFailure, dispatcher.provider, UNAUTHENTICATED_WEBHOOK_METADATA, verification.reason);
      const { status, body } = failureToResponse(verification.reason);
      return c.json(body, status);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      await recordWebhookFailure(options.onWebhookFailure, dispatcher.provider, UNAUTHENTICATED_WEBHOOK_METADATA, "invalid_json");
      return c.json({ success: false, error: { code: errorCode.badRequest, message: "Invalid JSON payload" } }, 400);
    }

    try {
      const ingestion = createPaymentWebhookIngestion({
        provider: dispatcher.provider,
        mapEvent: dispatcher.mapEvent,
        webhookEventStore: options.webhookEventStore,
        onPaymentEvent: options.onPaymentEvent,
        onWebhookFailure: options.onWebhookFailure,
      });
      const result = await ingestion.ingestVerifiedPayload(payload, {
        signatureTimestamp: signatureTimestamp(signatureHeader),
        requestId,
        correlationId,
      });
      return c.json({ success: true, data: result }, 200);
    } catch (error) {
      if (error instanceof PaymentWebhookIngestionError) {
        return c.json({
          success: false,
          error: { code: errorCode.badRequest, message: error.message },
        }, 400);
      }
      throw error;
    }
  });

  return {
    router,
  };
}
