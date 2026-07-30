import { and, eq, lte, or } from "drizzle-orm";

import type { WebhookEventStore } from "@platform/payments-core";
import { paymentWebhookEvents } from "@platform/platform-db";

import { redactString } from "../../observability/redaction";

type PaymentWebhookEventStoreDeps = {
  db: any;
};

const REDACTED = "[redacted]";
const SENSITIVE_KEYS = /authorization|card|cvv|email|password|secret|signature|token/i;
const STALE_PROCESSING_MS = 15 * 60 * 1000;

function sanitizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        SENSITIVE_KEYS.test(key) ? REDACTED : sanitizeJson(child),
      ]),
    );
  }

  return value;
}

function numericDetail(error: Error & Record<string, unknown>, key: string) {
  const value = error[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringDetail(error: Error & Record<string, unknown>, key: string) {
  const value = error[key];
  return typeof value === "string" && value ? value : undefined;
}

function safeErrorDetails(error: unknown) {
  if (error instanceof Error) {
    const record = error as Error & Record<string, unknown>;
    return {
      name: redactString(error.name),
      message: redactString(error.message),
      ...(stringDetail(record, "code") ? { code: stringDetail(record, "code") } : {}),
      ...(numericDetail(record, "status") ? { status: numericDetail(record, "status") } : {}),
      ...(numericDetail(record, "statusCode") ? { statusCode: numericDetail(record, "statusCode") } : {}),
      ...(error.stack ? { stack: redactString(error.stack) } : {}),
    };
  }

  return {
    message: redactString(String(error)),
  };
}

export function createPaymentWebhookEventStore(deps: PaymentWebhookEventStoreDeps): WebhookEventStore {
  return {
    async claim(event) {
      const [created] = await deps.db
        .insert(paymentWebhookEvents)
        .values({
          provider: event.provider,
          providerEventId: event.providerEventId,
          eventType: event.eventType,
          paymentId: event.paymentId,
          signatureTimestamp: event.signatureTimestamp,
          sanitizedPayload: sanitizeJson(event.sanitizedPayload),
          requestId: event.requestId ?? null,
          correlationId: event.correlationId ?? null,
          processingStatus: "processing",
        })
        .onConflictDoNothing({ target: [paymentWebhookEvents.provider, paymentWebhookEvents.providerEventId] })
        .returning({ id: paymentWebhookEvents.id });

      if (created) {
        return { claimed: true };
      }

      const existing = await deps.db.query.paymentWebhookEvents.findFirst({
        where: and(
          eq(paymentWebhookEvents.provider, event.provider),
          eq(paymentWebhookEvents.providerEventId, event.providerEventId),
        ),
      });

      const staleProcessing = existing?.processingStatus === "processing" && existing.updatedAt <= new Date(Date.now() - STALE_PROCESSING_MS);

      if (existing?.processingStatus === "failed" || staleProcessing) {
        const [claimed] = await deps.db
          .update(paymentWebhookEvents)
          .set({
            eventType: event.eventType,
            paymentId: event.paymentId,
            signatureTimestamp: event.signatureTimestamp,
            sanitizedPayload: sanitizeJson(event.sanitizedPayload),
            requestId: event.requestId ?? null,
            correlationId: event.correlationId ?? null,
            durationMs: null,
            processingStatus: "processing",
            errorDetails: null,
            failedAt: null,
            nextAttemptAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(paymentWebhookEvents.provider, event.provider),
              eq(paymentWebhookEvents.providerEventId, event.providerEventId),
              or(
                eq(paymentWebhookEvents.processingStatus, "failed"),
                and(eq(paymentWebhookEvents.processingStatus, "processing"), lte(paymentWebhookEvents.updatedAt, new Date(Date.now() - STALE_PROCESSING_MS))),
              ),
            ),
          )
          .returning({ id: paymentWebhookEvents.id });

        if (claimed) {
          return { claimed: true };
        }
      }

      return { claimed: false, status: existing?.processingStatus ?? "processing" };
    },

    async markProcessed(event) {
      await deps.db
        .update(paymentWebhookEvents)
        .set({
          processingStatus: "processed",
          nextAttemptAt: null,
          deadLetteredAt: null,
          durationMs: event.durationMs ?? null,
          processedAt: new Date(),
          failedAt: null,
          errorDetails: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(paymentWebhookEvents.provider, event.provider),
            eq(paymentWebhookEvents.providerEventId, event.providerEventId),
          ),
        );
    },

    async markFailed(event) {
      await deps.db
        .update(paymentWebhookEvents)
        .set({
          processingStatus: "failed",
          nextAttemptAt: new Date(Date.now() + 60_000),
          durationMs: event.durationMs ?? null,
          failedAt: new Date(),
          errorDetails: safeErrorDetails(event.error),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(paymentWebhookEvents.provider, event.provider),
            eq(paymentWebhookEvents.providerEventId, event.providerEventId),
          ),
        );
    },
  };
}
