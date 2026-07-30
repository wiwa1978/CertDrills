import { z } from "zod";

import type { NormalizedPaymentEvent } from "../../types";

const disputeEventTypes = [
  "dispute.opened",
  "dispute.expired",
  "dispute.accepted",
  "dispute.cancelled",
  "dispute.challenged",
  "dispute.won",
  "dispute.lost",
] as const;

const subscriptionEventTypes = [
  "subscription.active",
  "subscription.renewed",
  "subscription.cancelled",
  "subscription.failed",
  "subscription.expired",
  "subscription.on_hold",
  "subscription.plan_changed",
  "subscription.updated",
] as const;

const disputeEventTypeSchema = z.enum(disputeEventTypes);

const paymentSucceededSchema = z.object({
  id: z.string().min(1).optional(),
  event_id: z.string().min(1).optional(),
  type: z.literal("payment.succeeded"),
  data: z.object({
    payment_id: z.string().min(1),
    metadata: z.record(z.string(), z.string()).optional(),
    customer: z
      .object({
        email: z.string().email().optional(),
        customer_id: z.string().min(1).optional(),
      })
      .optional(),
    product_cart: z
      .array(
        z.object({
          product_id: z.string().min(1),
        }),
      )
      .optional(),
    settlement_amount: z.number().optional(),
    total_amount: z.number().optional(),
    settlement_tax: z.number().optional(),
    tax: z.number().optional(),
    settlement_currency: z.string().optional(),
  }),
});

const paymentFailedSchema = z.object({
  id: z.string().min(1).optional(),
  event_id: z.string().min(1).optional(),
  type: z.literal("payment.failed"),
  data: z.object({
    payment_id: z.string().min(1),
    metadata: z.record(z.string(), z.string()).optional(),
    customer: z
      .object({
        email: z.string().email().optional(),
        customer_id: z.string().min(1).optional(),
      })
      .optional(),
    product_cart: z
      .array(
        z.object({
          product_id: z.string().min(1),
        }),
      )
      .optional(),
    settlement_amount: z.number().optional(),
    total_amount: z.number().optional(),
    settlement_tax: z.number().optional(),
    tax: z.number().optional(),
    settlement_currency: z.string().optional(),
  }),
});

const paymentProcessingSchema = paymentFailedSchema.extend({
  type: z.literal("payment.processing"),
});

const refundSucceededSchema = z.object({
  id: z.string().min(1).optional(),
  event_id: z.string().min(1).optional(),
  type: z.literal("refund.succeeded"),
  data: z.object({
    payment_id: z.string().min(1),
    refund_id: z.string().min(1).optional(),
    is_partial: z.boolean().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    customer: z
      .object({
        email: z.string().email().optional(),
        customer_id: z.string().min(1).optional(),
      })
      .optional(),
    amount: z.number().nullable().optional(),
    currency: z.string().nullable().optional(),
  }),
});

const disputeSchema = z.object({
  id: z.string().min(1).optional(),
  event_id: z.string().min(1).optional(),
  type: disputeEventTypeSchema,
  data: z.object({
    payment_id: z.string().min(1),
    dispute_id: z.string().min(1),
    dispute_status: z.string().min(1).optional(),
    customer: z
      .object({
        email: z.string().email().optional(),
        customer_id: z.string().min(1).optional(),
      })
      .optional(),
    amount: z.union([z.number(), z.string()]).optional(),
    currency: z.string().optional(),
  }),
});

const baseSchema = z.object({
  id: z.string().min(1).optional(),
  event_id: z.string().min(1).optional(),
  type: z.string().optional(),
  event_type: z.string().optional(),
  data: z.unknown().optional(),
});

export function mapDodoEvent(payload: unknown): NormalizedPaymentEvent | null {
  const parsed = baseSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }

  const eventType = parsed.data.type ?? parsed.data.event_type;
  if (!eventType) return null;

  if (eventType === "payment.succeeded") {
    const succeeded = paymentSucceededSchema.safeParse(payload);
    if (!succeeded.success) {
      return null;
    }

    const data = succeeded.data.data;
    return {
      provider: "dodo",
      providerEventId: succeeded.data.id ?? succeeded.data.event_id,
      eventType: "payment.succeeded",
      paymentId: data.payment_id,
      customerEmail: data.customer?.email,
      customerId: data.customer?.customer_id,
      productId: data.product_cart?.[0]?.product_id,
      metadata: data.metadata,
      currency: data.settlement_currency,
      totalAmount: data.settlement_amount ?? data.total_amount,
      taxAmount: data.settlement_tax ?? data.tax,
      raw: payload,
    };
  }

  if (eventType === "payment.failed") {
    const failed = paymentFailedSchema.safeParse(payload);
    if (!failed.success) {
      return null;
    }

    const data = failed.data.data;
    return {
      provider: "dodo",
      providerEventId: failed.data.id ?? failed.data.event_id,
      eventType: "payment.failed",
      paymentId: data.payment_id,
      customerEmail: data.customer?.email,
      customerId: data.customer?.customer_id,
      productId: data.product_cart?.[0]?.product_id,
      metadata: data.metadata,
      currency: data.settlement_currency,
      totalAmount: data.settlement_amount ?? data.total_amount,
      taxAmount: data.settlement_tax ?? data.tax,
      raw: payload,
    };
  }

  if (eventType === "payment.processing") {
    const processing = paymentProcessingSchema.safeParse(payload);
    if (!processing.success) {
      return null;
    }

    const data = processing.data.data;
    return {
      provider: "dodo",
      providerEventId: processing.data.id ?? processing.data.event_id,
      eventType: "payment.processing",
      paymentId: data.payment_id,
      customerEmail: data.customer?.email,
      customerId: data.customer?.customer_id,
      productId: data.product_cart?.[0]?.product_id,
      metadata: data.metadata,
      currency: data.settlement_currency,
      totalAmount: data.settlement_amount ?? data.total_amount,
      taxAmount: data.settlement_tax ?? data.tax,
      raw: payload,
    };
  }

  if (eventType === "refund.succeeded") {
    const refund = refundSucceededSchema.safeParse(payload);
    if (!refund.success) {
      return null;
    }

    const data = refund.data.data;
    return {
      provider: "dodo",
      providerEventId: refund.data.id ?? refund.data.event_id,
      eventType: "refund.succeeded",
      paymentId: data.payment_id,
      refundId: data.refund_id,
      refundIsPartial: data.is_partial,
      customerEmail: data.customer?.email,
      customerId: data.customer?.customer_id,
      metadata: data.metadata,
      currency: data.currency ?? undefined,
      totalAmount: data.amount ?? undefined,
      raw: payload,
    };
  }

  if (disputeEventTypes.includes(eventType as (typeof disputeEventTypes)[number])) {
    const dispute = disputeSchema.safeParse(payload);
    if (!dispute.success) {
      return null;
    }

    const data = dispute.data.data;
    const amount = typeof data.amount === "string" ? Number(data.amount) : data.amount;
    return {
      provider: "dodo",
      providerEventId: dispute.data.id ?? dispute.data.event_id,
      eventType: eventType as (typeof disputeEventTypes)[number],
      paymentId: data.payment_id,
      disputeId: data.dispute_id,
      disputeStatus: data.dispute_status,
      customerEmail: data.customer?.email,
      customerId: data.customer?.customer_id,
      currency: data.currency,
      totalAmount: Number.isFinite(amount) ? amount : undefined,
      raw: payload,
    };
  }

  if (subscriptionEventTypes.includes(eventType as (typeof subscriptionEventTypes)[number])) {
    const data = parsed.data.data as { subscription_id?: unknown } | undefined;
    const subscriptionId = typeof data?.subscription_id === "string" ? data.subscription_id : "subscription";

    return {
      provider: "dodo",
      providerEventId: parsed.data.id ?? parsed.data.event_id,
      eventType: eventType as (typeof subscriptionEventTypes)[number],
      paymentId: subscriptionId,
      raw: payload,
    };
  }

  return null;
}
