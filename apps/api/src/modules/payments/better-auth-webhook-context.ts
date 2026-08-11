import { AsyncLocalStorage } from "node:async_hooks";

import { webhooks } from "@dodopayments/better-auth";

import type { PaymentWebhookIngestion, VerifiedWebhookContext } from "@platform/payments-core";

type BetterAuthWebhookContext = VerifiedWebhookContext & {
  providerEventId: string | null;
};

const storage = new AsyncLocalStorage<BetterAuthWebhookContext>();

function parseSignatureTimestamp(value: string | undefined) {
  if (!value) return undefined;

  const timestampSeconds = Number.parseInt(value, 10);
  return Number.isFinite(timestampSeconds)
    ? new Date(timestampSeconds * 1000)
    : undefined;
}

export function runWithBetterAuthWebhookContext(
  headers: Headers,
  requestId: string | null,
  callback: () => Promise<void>,
) {
  return storage.run({
    providerEventId: headers.get("webhook-id"),
    requestId,
    correlationId: headers.get("x-correlation-id") ?? requestId,
    signatureTimestamp: parseSignatureTimestamp(headers.get("webhook-timestamp") ?? undefined),
  }, callback);
}

export function getBetterAuthWebhookContext() {
  return storage.getStore();
}

export function createBetterAuthDodoWebhook(
  webhookKey: string,
  ingestion: PaymentWebhookIngestion,
) {
  return webhooks({
    webhookKey,
    onPayload: async (payload) => {
      const context = getBetterAuthWebhookContext();
      const verifiedPayload = context?.providerEventId && payload && typeof payload === "object"
        ? { ...payload, id: context.providerEventId }
        : payload;
      await ingestion.ingestVerifiedPayload(verifiedPayload, context);
    },
  });
}
