import { z } from "zod";

import { subscriptionPlans } from "../../config/billing";
import { normalizeSubscriptionStatus, type UpsertUserSubscriptionInput } from "./subscription-service";

const subscriptionWebhookEventTypes = [
  "subscription.active",
  "subscription.renewed",
  "subscription.cancelled",
  "subscription.failed",
  "subscription.expired",
  "subscription.on_hold",
  "subscription.plan_changed",
  "subscription.updated",
] as const;

type SubscriptionWebhookEventType = typeof subscriptionWebhookEventTypes[number];

const subscriptionWebhookSchema = z.object({
  event_type: z.enum(subscriptionWebhookEventTypes),
  data: z.object({
    subscription_id: z.string().min(1),
    product_id: z.string().min(1),
    status: z.string().min(1),
    customer: z.object({
      customer_id: z.string().min(1).optional(),
    }).passthrough().optional(),
    metadata: z.record(z.string(), z.string()).optional().nullable(),
    previous_billing_date: z.string().optional().nullable(),
    next_billing_date: z.string().optional().nullable(),
    cancel_at_next_billing_date: z.boolean().optional(),
  }).passthrough(),
});

export type SubscriptionWebhookDeps = {
  subscriptions: {
    recordSubscriptionEvent: (input: {
      userId?: string | null;
      providerSubscriptionId?: string | null;
      dodoSubscriptionId?: string | null;
      eventType: string;
      status?: UpsertUserSubscriptionInput["status"] | null;
      payload?: unknown;
    }) => Promise<void>;
    upsertUserSubscription: (input: UpsertUserSubscriptionInput) => Promise<unknown>;
  };
};

export function isProviderSubscriptionWebhookEvent(eventType: string): eventType is SubscriptionWebhookEventType {
  return subscriptionWebhookEventTypes.includes(eventType as SubscriptionWebhookEventType);
}

export const isDodoSubscriptionWebhookEvent = isProviderSubscriptionWebhookEvent;

export function getSubscriptionWebhookStatus(eventType: SubscriptionWebhookEventType, payloadStatus: string) {
  if (eventType === "subscription.failed") {
    return "past_due" as const;
  }

  if (eventType === "subscription.on_hold") {
    return "paused" as const;
  }

  if (eventType === "subscription.expired") {
    return "expired" as const;
  }

  return normalizeSubscriptionStatus(payloadStatus);
}

function parseDate(value: string | null | undefined) {
  return value ? new Date(value) : null;
}

function getPlanKey(productId: string, metadata: Record<string, string> | null | undefined) {
  if (metadata?.planKey) {
    return metadata.planKey;
  }

  const plan = subscriptionPlans.find((entry) => Object.values(entry.providerProductIds).includes(productId));
  return plan?.key ?? null;
}

export function createSubscriptionWebhookHandler(deps: SubscriptionWebhookDeps) {
  return async function handleSubscriptionWebhook(payload: unknown) {
    const parsed = subscriptionWebhookSchema.parse(payload);
    const data = parsed.data;
    const status = getSubscriptionWebhookStatus(parsed.event_type, data.status);
    const userId = data.metadata?.userId ?? null;
    const planKey = getPlanKey(data.product_id, data.metadata);

    await deps.subscriptions.recordSubscriptionEvent({
      userId,
      providerSubscriptionId: data.subscription_id,
      eventType: parsed.event_type,
      status,
      payload,
    });

    if (!userId || !planKey) {
      throw new Error("Subscription webhook is missing user or plan metadata");
    }

    await deps.subscriptions.upsertUserSubscription({
      userId,
      planKey,
      providerCustomerId: data.customer?.customer_id ?? null,
      providerSubscriptionId: data.subscription_id,
      dodoSubscriptionId: data.subscription_id,
      status,
      currentPeriodStart: parseDate(data.previous_billing_date),
      currentPeriodEnd: parseDate(data.next_billing_date),
      cancelAtPeriodEnd: data.cancel_at_next_billing_date ?? false,
    });
  };
}
