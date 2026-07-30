import { and, desc, eq, isNotNull, like, sql } from "drizzle-orm";

import { subscriptionEvents, subscriptionPayments, type SubscriptionStatus, user, userSubscriptions } from "@platform/platform-db";

import { subscriptionPlans } from "../../config/billing";
import { redactLogValue } from "../../observability/redaction";
import type { PaymentProvider } from "../payments/provider";

type SubscriptionServiceDeps = {
  db: any;
  paymentProvider?: PaymentProvider;
};

type SubscriptionPaymentStatus = "completed" | "pending" | "failed" | "refunded";

type RecordSubscriptionPaymentInput = {
  userId: string;
  planKey: string;
  paymentId: string;
  paymentStatus: SubscriptionPaymentStatus;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  dodoCustomerId?: string | null;
  dodoSubscriptionId?: string | null;
  pricing: {
    priceExclVat: number;
    priceInclVat: number;
    vatAmount: number;
    currency: string;
  };
};

type CreateSubscriptionRefundInput = {
  paymentId: string;
  reason?: string | null;
  actorUserId?: string | null;
};

const supportedStatuses = new Set<SubscriptionStatus>([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "expired",
  "paused",
]);

export type UpsertUserSubscriptionInput = {
  userId: string;
  planKey: string;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  dodoCustomerId?: string | null;
  dodoSubscriptionId: string;
  status: SubscriptionStatus | "cancelled";
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
};

export type RecordSubscriptionEventInput = {
  userId?: string | null;
  providerSubscriptionId?: string | null;
  dodoSubscriptionId?: string | null;
  eventType: string;
  status?: SubscriptionStatus | "cancelled" | null;
  payload?: unknown;
};

export function normalizeSubscriptionStatus(status: string): SubscriptionStatus {
  const normalized = status === "cancelled" ? "canceled" : status;

  if (supportedStatuses.has(normalized as SubscriptionStatus)) {
    return normalized as SubscriptionStatus;
  }

  if (status === "failed") {
    return "past_due";
  }

  if (status === "on_hold") {
    return "paused";
  }

  if (status === "pending") {
    return "trialing";
  }

  throw new Error(`Unsupported subscription status: ${status}`);
}

export function hasActiveSubscriptionStatus(status: SubscriptionStatus) {
  return status === "active" || status === "trialing";
}

export function calculateSubscriptionRecurringRevenue(subscriptions: Array<{ planKey: string; status: SubscriptionStatus }>) {
  const monthlyRecurringRevenueCents = subscriptions.reduce((total, subscription) => {
    if (!hasActiveSubscriptionStatus(subscription.status)) {
      return total;
    }

    const plan = subscriptionPlans.find((entry) => entry.key === subscription.planKey);
    return total + (plan?.price ?? 0);
  }, 0);
  const monthlyRecurringRevenue = monthlyRecurringRevenueCents / 100;

  return {
    monthlyRecurringRevenue,
    annualRecurringRevenue: monthlyRecurringRevenue * 12,
  };
}

function normalizeLimit(limit: number, max = 100) {
  if (!Number.isFinite(limit)) {
    return Math.min(20, max);
  }

  return Math.min(Math.max(Math.trunc(limit), 1), max);
}

function normalizeOffset(offset: number) {
  if (!Number.isFinite(offset)) {
    return 0;
  }

  return Math.max(Math.trunc(offset), 0);
}

function normalizeSearchEmail(searchEmail?: string) {
  const normalized = searchEmail?.trim();
  return normalized ? normalized.slice(0, 255) : undefined;
}

export function createSubscriptionService(deps: SubscriptionServiceDeps) {
  async function getUserSubscription(userId: string) {
    const subscription = await deps.db.query.userSubscriptions.findFirst({
      where: eq(userSubscriptions.userId, userId),
      orderBy: desc(userSubscriptions.createdAt),
    });

    return subscription
      ? {
          ...subscription,
          providerCustomerId: subscription.providerCustomerId ?? subscription.dodoCustomerId,
          providerSubscriptionId: subscription.providerSubscriptionId ?? subscription.dodoSubscriptionId,
        }
      : null;
  }

  async function recordSubscriptionPayment(input: RecordSubscriptionPaymentInput) {
    const now = new Date();
    const providerCustomerId = input.providerCustomerId ?? input.dodoCustomerId ?? null;
    const providerSubscriptionId = input.providerSubscriptionId ?? input.dodoSubscriptionId ?? null;
    const paymentSnapshot = {
      provider: deps.paymentProvider?.name ?? "dodo",
      planKey: input.planKey,
      customerId: providerCustomerId ?? undefined,
      subscriptionId: providerSubscriptionId ?? undefined,
      priceExclVat: input.pricing.priceExclVat,
      priceInclVat: input.pricing.priceInclVat,
      vatAmount: input.pricing.vatAmount,
      currency: input.pricing.currency,
    };

    return deps.db.transaction(async (tx: any) => {
      const existing = await tx.query.subscriptionPayments.findFirst({
        where: eq(subscriptionPayments.paymentId, input.paymentId),
      });

      if (existing && existing.userId !== input.userId) {
        throw new Error(`Payment ${input.paymentId} is already associated with another user`);
      }

      const [payment] = await tx
        .insert(subscriptionPayments)
        .values({
          userId: input.userId,
          planKey: input.planKey,
          providerCustomerId,
          providerSubscriptionId,
          dodoCustomerId: providerCustomerId,
          dodoSubscriptionId: providerSubscriptionId,
          paymentStatus: input.paymentStatus,
          priceExclVat: input.pricing.priceExclVat,
          priceInclVat: input.pricing.priceInclVat,
          vatAmount: input.pricing.vatAmount,
          currency: input.pricing.currency,
          paymentSnapshot,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [subscriptionPayments.paymentProvider, subscriptionPayments.paymentId],
          set: {
            paymentStatus: input.paymentStatus,
            providerCustomerId: providerCustomerId ?? existing?.providerCustomerId ?? existing?.dodoCustomerId ?? null,
            providerSubscriptionId: providerSubscriptionId ?? existing?.providerSubscriptionId ?? existing?.dodoSubscriptionId ?? null,
            dodoCustomerId: providerCustomerId ?? existing?.dodoCustomerId ?? null,
            dodoSubscriptionId: providerSubscriptionId ?? existing?.dodoSubscriptionId ?? null,
            priceExclVat: input.pricing.priceExclVat,
            priceInclVat: input.pricing.priceInclVat,
            vatAmount: input.pricing.vatAmount,
            currency: input.pricing.currency,
            paymentSnapshot,
            updatedAt: now,
          },
        })
        .returning();

      return payment;
    });
  }

  async function listUserSubscriptionPayments(userId: string, limit = 50) {
    const normalizedLimit = normalizeLimit(limit, 100);

    return deps.db
      .select({
        id: subscriptionPayments.id,
        planKey: subscriptionPayments.planKey,
        providerSubscriptionId: subscriptionPayments.providerSubscriptionId,
        dodoSubscriptionId: subscriptionPayments.dodoSubscriptionId,
        paymentStatus: subscriptionPayments.paymentStatus,
        paymentId: subscriptionPayments.paymentId,
        priceExclVat: subscriptionPayments.priceExclVat,
        priceInclVat: subscriptionPayments.priceInclVat,
        vatAmount: subscriptionPayments.vatAmount,
        currency: subscriptionPayments.currency,
        createdAt: subscriptionPayments.createdAt,
      })
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.userId, userId))
      .orderBy(desc(subscriptionPayments.createdAt))
      .limit(normalizedLimit);
  }

  async function listSubscriptionPayments(limit = 20, offset = 0, searchEmail?: string) {
    const normalizedLimit = normalizeLimit(limit, 100);
    const normalizedOffset = normalizeOffset(offset);
    const normalizedSearchEmail = normalizeSearchEmail(searchEmail);
    const whereCondition = normalizedSearchEmail ? like(user.email, `%${normalizedSearchEmail}%`) : undefined;

    const [payments, totalCountResult] = await Promise.all([
      deps.db
        .select({
          id: subscriptionPayments.id,
          userId: subscriptionPayments.userId,
          planKey: subscriptionPayments.planKey,
          providerSubscriptionId: subscriptionPayments.providerSubscriptionId,
          dodoSubscriptionId: subscriptionPayments.dodoSubscriptionId,
          paymentStatus: subscriptionPayments.paymentStatus,
          paymentId: subscriptionPayments.paymentId,
          priceExclVat: subscriptionPayments.priceExclVat,
          priceInclVat: subscriptionPayments.priceInclVat,
          vatAmount: subscriptionPayments.vatAmount,
          currency: subscriptionPayments.currency,
          paymentMethod: subscriptionPayments.paymentMethod,
          paymentMethodType: subscriptionPayments.paymentMethodType,
          refundStatus: subscriptionPayments.refundStatus,
          errorCode: subscriptionPayments.errorCode,
          errorMessage: subscriptionPayments.errorMessage,
          createdAt: subscriptionPayments.createdAt,
          userName: user.name,
          userEmail: user.email,
        })
        .from(subscriptionPayments)
        .innerJoin(user, eq(subscriptionPayments.userId, user.id))
        .where(whereCondition)
        .orderBy(desc(subscriptionPayments.createdAt))
        .limit(normalizedLimit)
        .offset(normalizedOffset),
      deps.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(subscriptionPayments)
        .innerJoin(user, eq(subscriptionPayments.userId, user.id))
        .where(whereCondition),
    ]);

    const total = totalCountResult[0]?.count ?? 0;
    return {
      payments,
      total,
      hasMore: normalizedOffset + normalizedLimit < total,
    };
  }

  async function downloadSubscriptionInvoice(userId: string, paymentId: string) {
    const [payment] = await deps.db
      .select({
        id: subscriptionPayments.id,
        userId: subscriptionPayments.userId,
        paymentStatus: subscriptionPayments.paymentStatus,
      })
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.paymentId, paymentId))
      .limit(1);

    if (!payment) {
      throw new Error("Subscription payment not found");
    }

    if (payment.userId !== userId) {
      throw new Error("Unauthorized");
    }

    if (payment.paymentStatus !== "completed") {
      throw new Error("Invoice not available for this payment");
    }

    if (!deps.paymentProvider?.getInvoice) {
      throw new Error("Payment provider invoice support is not configured");
    }

    const invoice = await deps.paymentProvider.getInvoice(paymentId);

    return {
      success: true as const,
      invoiceUrl: invoice.invoiceUrl,
    };
  }

  async function createSubscriptionRefund(input: CreateSubscriptionRefundInput) {
    if (!deps.paymentProvider?.createRefund) {
      throw new Error("Payment provider refund support is not configured");
    }

    const payment = await deps.db.transaction(async (tx: any) => {
      const lockedPayment = await tx.query.subscriptionPayments.findFirst({
        where: eq(subscriptionPayments.paymentId, input.paymentId),
      });

      if (!lockedPayment) {
        return null;
      }

      if (lockedPayment.paymentStatus !== "completed") {
        return lockedPayment;
      }

      const [processingPayment] = await tx
        .update(subscriptionPayments)
        .set({ paymentStatus: "pending", updatedAt: new Date() })
        .where(eq(subscriptionPayments.id, lockedPayment.id))
        .returning();

      return processingPayment ?? lockedPayment;
    });

    if (!payment) {
      throw new Error("Subscription payment not found");
    }

    if (payment.paymentStatus !== "pending") {
      throw new Error("Only completed payments can be refunded");
    }

    try {
      const refund = await deps.paymentProvider.createRefund({
        paymentId: payment.paymentId,
        reason: input.reason || null,
        metadata: {
          initiated_by: "admin_api",
          ...(input.actorUserId ? { actor_user_id: input.actorUserId } : {}),
          user_id: payment.userId,
          local_subscription_payment_id: payment.id,
        },
        idempotencyKey: `subscription-refund:${payment.paymentProvider}:${payment.paymentId}`,
      });

      const paymentSnapshot = {
        ...(payment.paymentSnapshot && typeof payment.paymentSnapshot === "object" ? payment.paymentSnapshot : {}),
        adminRefund: refund,
      };

      const [updatedPayment] = await deps.db
        .update(subscriptionPayments)
        .set({
          paymentStatus: "refunded",
          refundStatus: refund.status,
          paymentSnapshot,
          updatedAt: new Date(),
        })
        .where(eq(subscriptionPayments.id, payment.id))
        .returning();

      return {
        payment: updatedPayment ?? { ...payment, paymentStatus: "refunded", paymentSnapshot },
        refund,
      };
    } catch (error) {
      await deps.db
        .update(subscriptionPayments)
        .set({ paymentStatus: "completed", updatedAt: new Date() })
        .where(eq(subscriptionPayments.id, payment.id));

      throw error;
    }
  }

  async function getLatestProviderCustomerId(userId: string) {
    const [subscription] = await deps.db
      .select({
        providerCustomerId: userSubscriptions.providerCustomerId,
        dodoCustomerId: userSubscriptions.dodoCustomerId,
      })
      .from(userSubscriptions)
      .where(and(eq(userSubscriptions.userId, userId), isNotNull(userSubscriptions.providerCustomerId)))
      .orderBy(desc(userSubscriptions.createdAt))
      .limit(1);

    if (subscription?.providerCustomerId) {
      return subscription.providerCustomerId;
    }

    const [legacySubscription] = await deps.db
      .select({ dodoCustomerId: userSubscriptions.dodoCustomerId })
      .from(userSubscriptions)
      .where(and(eq(userSubscriptions.userId, userId), isNotNull(userSubscriptions.dodoCustomerId)))
      .orderBy(desc(userSubscriptions.createdAt))
      .limit(1);

    if (legacySubscription?.dodoCustomerId) {
      return legacySubscription.dodoCustomerId;
    }

    const [payment] = await deps.db
      .select({
        providerCustomerId: subscriptionPayments.providerCustomerId,
        dodoCustomerId: subscriptionPayments.dodoCustomerId,
      })
      .from(subscriptionPayments)
      .where(and(eq(subscriptionPayments.userId, userId), isNotNull(subscriptionPayments.providerCustomerId)))
      .orderBy(desc(subscriptionPayments.createdAt))
      .limit(1);

    if (payment?.providerCustomerId) {
      return payment.providerCustomerId;
    }

    const [legacyPayment] = await deps.db
      .select({ dodoCustomerId: subscriptionPayments.dodoCustomerId })
      .from(subscriptionPayments)
      .where(and(eq(subscriptionPayments.userId, userId), isNotNull(subscriptionPayments.dodoCustomerId)))
      .orderBy(desc(subscriptionPayments.createdAt))
      .limit(1);

    return legacyPayment?.dodoCustomerId ?? null;
  }

  async function upsertUserSubscription(input: UpsertUserSubscriptionInput) {
    const status = normalizeSubscriptionStatus(input.status);
    const providerCustomerId = input.providerCustomerId ?? input.dodoCustomerId ?? null;
    const providerSubscriptionId = input.providerSubscriptionId ?? input.dodoSubscriptionId;
    const values = {
      userId: input.userId,
      planKey: input.planKey,
      providerCustomerId,
      providerSubscriptionId,
      dodoCustomerId: providerCustomerId,
      dodoSubscriptionId: providerSubscriptionId,
      status,
      currentPeriodStart: input.currentPeriodStart ?? null,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      updatedAt: new Date(),
    };

    const [subscription] = await deps.db
      .insert(userSubscriptions)
      .values(values)
      .onConflictDoUpdate({
        target: userSubscriptions.providerSubscriptionId,
        set: values,
      })
      .returning();

    return subscription;
  }

  async function recordSubscriptionEvent(input: RecordSubscriptionEventInput) {
    await deps.db.insert(subscriptionEvents).values({
      userId: input.userId ?? null,
      providerSubscriptionId: input.providerSubscriptionId ?? input.dodoSubscriptionId ?? null,
      dodoSubscriptionId: input.providerSubscriptionId ?? input.dodoSubscriptionId ?? null,
      eventType: input.eventType,
      status: input.status ? normalizeSubscriptionStatus(input.status) : null,
      payload: redactLogValue(input.payload) ?? null,
    });
  }

  async function listSubscriptions(limit = 20, offset = 0, searchEmail?: string) {
    const normalizedLimit = normalizeLimit(limit, 100);
    const normalizedOffset = normalizeOffset(offset);
    const normalizedSearchEmail = normalizeSearchEmail(searchEmail);
    const whereCondition = normalizedSearchEmail ? like(user.email, `%${normalizedSearchEmail}%`) : undefined;

    const [subscriptions, totalCountResult] = await Promise.all([
      deps.db
        .select({
          id: userSubscriptions.id,
          userId: userSubscriptions.userId,
          planKey: userSubscriptions.planKey,
          providerCustomerId: userSubscriptions.providerCustomerId,
          providerSubscriptionId: userSubscriptions.providerSubscriptionId,
          dodoCustomerId: userSubscriptions.dodoCustomerId,
          dodoSubscriptionId: userSubscriptions.dodoSubscriptionId,
          status: userSubscriptions.status,
          currentPeriodStart: userSubscriptions.currentPeriodStart,
          currentPeriodEnd: userSubscriptions.currentPeriodEnd,
          cancelAtPeriodEnd: userSubscriptions.cancelAtPeriodEnd,
          createdAt: userSubscriptions.createdAt,
          updatedAt: userSubscriptions.updatedAt,
          userName: user.name,
          userEmail: user.email,
        })
        .from(userSubscriptions)
        .innerJoin(user, eq(userSubscriptions.userId, user.id))
        .where(whereCondition)
        .orderBy(desc(userSubscriptions.createdAt))
        .limit(normalizedLimit)
        .offset(normalizedOffset),
      deps.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(userSubscriptions)
        .innerJoin(user, eq(userSubscriptions.userId, user.id))
        .where(whereCondition),
    ]);

    const total = totalCountResult[0]?.count ?? 0;
    return {
      subscriptions,
      total,
      hasMore: normalizedOffset + normalizedLimit < total,
    };
  }

  async function getSubscriptionStats() {
    const subscriptions = await deps.db
      .select({
        planKey: userSubscriptions.planKey,
        status: userSubscriptions.status,
      })
      .from(userSubscriptions);
    const recurringRevenue = calculateSubscriptionRecurringRevenue(subscriptions);

    return {
      totalSubscriptions: subscriptions.length,
      activeSubscriptions: subscriptions.filter((item: { status: SubscriptionStatus }) => item.status === "active").length,
      trialingSubscriptions: subscriptions.filter((item: { status: SubscriptionStatus }) => item.status === "trialing").length,
      pastDueSubscriptions: subscriptions.filter((item: { status: SubscriptionStatus }) => item.status === "past_due").length,
      canceledSubscriptions: subscriptions.filter((item: { status: SubscriptionStatus }) => item.status === "canceled").length,
      ...recurringRevenue,
    };
  }

  async function getSubscriptionFinanceSummary() {
    const [localPayments, providerPayments, providerSubscriptions] = await Promise.all([
      deps.db
        .select({
          paymentId: subscriptionPayments.paymentId,
          providerSubscriptionId: subscriptionPayments.providerSubscriptionId,
          dodoSubscriptionId: subscriptionPayments.dodoSubscriptionId,
          paymentStatus: subscriptionPayments.paymentStatus,
          priceInclVat: subscriptionPayments.priceInclVat,
          currency: subscriptionPayments.currency,
        })
        .from(subscriptionPayments),
      deps.paymentProvider?.finance?.listPayments?.({ pageSize: 100 }).catch(() => null) ?? Promise.resolve(null),
      deps.paymentProvider?.finance?.listSubscriptions?.({ pageSize: 100 }).catch(() => null) ?? Promise.resolve(null),
    ]);

    const localPaymentIds = new Set(localPayments.map((payment: { paymentId: string }) => payment.paymentId));
    const localSubscriptionIds = new Set(
      localPayments
        .map((payment: { providerSubscriptionId?: string | null; dodoSubscriptionId?: string | null }) => payment.providerSubscriptionId ?? payment.dodoSubscriptionId)
        .filter((id: string | null | undefined): id is string => typeof id === "string" && id.length > 0),
    );
    const primaryCurrency = localPayments.find((payment: { currency?: string | null }) => payment.currency)?.currency ?? "EUR";

    const totals = localPayments.reduce((summary: {
      grossRevenue: number;
      refundedRevenue: number;
      completedPayments: number;
      refundedPayments: number;
      failedPayments: number;
      pendingPayments: number;
    }, payment: { paymentStatus: SubscriptionPaymentStatus; priceInclVat: number }) => {
      if (payment.paymentStatus === "completed") {
        summary.completedPayments += 1;
        summary.grossRevenue += Number(payment.priceInclVat ?? 0);
      } else if (payment.paymentStatus === "refunded") {
        summary.refundedPayments += 1;
        summary.refundedRevenue += Number(payment.priceInclVat ?? 0);
      } else if (payment.paymentStatus === "failed") {
        summary.failedPayments += 1;
      } else if (payment.paymentStatus === "pending") {
        summary.pendingPayments += 1;
      }

      return summary;
    }, {
      grossRevenue: 0,
      refundedRevenue: 0,
      completedPayments: 0,
      refundedPayments: 0,
      failedPayments: 0,
      pendingPayments: 0,
    });

    const providerPaymentItems = providerPayments?.items ?? [];
    const providerSubscriptionItems = providerSubscriptions?.items ?? [];
    const unmatchedProviderPayments = providerPaymentItems.filter((payment) => !localPaymentIds.has(payment.paymentId)).length;
    const unmatchedProviderSubscriptions = providerSubscriptionItems.filter((subscription) => !localSubscriptionIds.has(subscription.subscriptionId)).length;

    return {
      currency: primaryCurrency,
      grossRevenue: totals.grossRevenue / 100,
      refundedRevenue: totals.refundedRevenue / 100,
      netRevenue: (totals.grossRevenue - totals.refundedRevenue) / 100,
      totalPayments: localPayments.length,
      completedPayments: totals.completedPayments,
      refundedPayments: totals.refundedPayments,
      failedPayments: totals.failedPayments,
      pendingPayments: totals.pendingPayments,
      providerFinanceAvailable: Boolean(providerPayments && providerSubscriptions),
      providerPaymentsChecked: providerPaymentItems.length,
      providerSubscriptionsChecked: providerSubscriptionItems.length,
      unmatchedProviderPayments,
      unmatchedProviderSubscriptions,
    };
  }

  async function getPlanDistribution() {
    const rows = await deps.db
      .select({
        planKey: userSubscriptions.planKey,
        count: sql<number>`COUNT(*)`,
      })
      .from(userSubscriptions)
      .groupBy(userSubscriptions.planKey);

    return rows.map((row: { planKey: string; count: number | string | bigint }) => ({
      planKey: row.planKey,
      count: Number(row.count),
    }));
  }

  async function listSubscriptionEvents(limit = 50) {
    const normalizedLimit = normalizeLimit(limit, 100);

    return deps.db
      .select({
        id: subscriptionEvents.id,
        userId: subscriptionEvents.userId,
        providerSubscriptionId: subscriptionEvents.providerSubscriptionId,
        dodoSubscriptionId: subscriptionEvents.dodoSubscriptionId,
        eventType: subscriptionEvents.eventType,
        status: subscriptionEvents.status,
        createdAt: subscriptionEvents.createdAt,
      })
      .from(subscriptionEvents)
      .orderBy(desc(subscriptionEvents.createdAt))
      .limit(normalizedLimit);
  }

  return {
    getUserSubscription,
    recordSubscriptionPayment,
    listUserSubscriptionPayments,
    listSubscriptionPayments,
    downloadSubscriptionInvoice,
    createSubscriptionRefund,
    getLatestProviderCustomerId,
    getLatestDodoCustomerId: getLatestProviderCustomerId,
    upsertUserSubscription,
    recordSubscriptionEvent,
    listSubscriptions,
    getSubscriptionStats,
    getSubscriptionFinanceSummary,
    getPlanDistribution,
    listSubscriptionEvents,
  };
}
