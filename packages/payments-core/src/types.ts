export type WebhookVerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason: "missing_secret" | "missing_header" | "malformed_header" | "timestamp_out_of_window" | "signature_mismatch";
    };

export type NormalizedPaymentEvent = {
  provider: string;
  providerEventId?: string;
  eventType:
    | "payment.succeeded"
    | "payment.failed"
    | "payment.processing"
    | "refund.succeeded"
    | "dispute.opened"
    | "dispute.expired"
    | "dispute.accepted"
     | "dispute.cancelled"
     | "dispute.challenged"
     | "dispute.won"
     | "dispute.lost"
     | "subscription.active"
     | "subscription.renewed"
     | "subscription.cancelled"
     | "subscription.failed"
     | "subscription.expired"
     | "subscription.on_hold"
     | "subscription.plan_changed"
     | "subscription.updated";
  paymentId: string;
  refundId?: string;
  refundIsPartial?: boolean;
  disputeId?: string;
  disputeStatus?: string;
  customerEmail?: string;
  customerId?: string;
  productId?: string;
  metadata?: Record<string, string>;
  currency?: string;
  totalAmount?: number;
  taxAmount?: number;
  raw: unknown;
};

export type PaymentEventHandler = (event: NormalizedPaymentEvent) => Promise<void>;

export type PaymentWebhookVerifier = (
  rawBody: string,
  signatureHeader: string | null,
) => Promise<boolean | WebhookVerifyResult> | boolean | WebhookVerifyResult;

export type PaymentWebhookProviderConfig = {
  provider: string;
  signatureHeaderName: string;
  secret?: string;
  toleranceSeconds?: number;
  verify: PaymentWebhookVerifier;
  mapEvent(payload: unknown): NormalizedPaymentEvent | null;
};

export type WebhookEventProcessingStatus = "processing" | "processed" | "failed";

export type WebhookEventStore = {
  claim: (event: {
    provider: string;
    providerEventId: string;
    eventType: string;
    paymentId?: string;
    signatureTimestamp?: Date;
    sanitizedPayload?: unknown;
    requestId?: string | null;
    correlationId?: string | null;
  }) => Promise<{ claimed: true } | { claimed: false; status: WebhookEventProcessingStatus }>;
  markProcessed: (event: { provider: string; providerEventId: string; durationMs?: number | null }) => Promise<void>;
  markFailed: (event: { provider: string; providerEventId: string; error: unknown; durationMs?: number | null }) => Promise<void>;
};

export type WebhookFailureAuditEvent = {
  provider: string;
  providerEventId?: string | null;
  eventType?: string | null;
  paymentId?: string | null;
  outcome: "failure";
  error: string;
};

export type CreatePaymentsModuleOptions = {
  /**
   * Optional override of the default Dodo signature verifier. May return a
   * boolean (legacy) or a {@link WebhookVerifyResult} for richer error codes.
   */
  verifyDodoWebhook?: PaymentWebhookVerifier;
  dodoWebhookSecret?: string;
  /** Replay-protection window in seconds. Default 300 (±5 minutes). */
  dodoWebhookToleranceSeconds?: number;
  webhookProviders?: PaymentWebhookProviderConfig[];
  webhookEventStore?: WebhookEventStore;
  onWebhookFailure?: (event: WebhookFailureAuditEvent) => Promise<void> | void;
  onPaymentEvent: PaymentEventHandler;
};
