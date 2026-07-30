import { or, eq } from "drizzle-orm";

import { creditPurchases, subscriptionPayments, userSubscriptions, type SubscriptionStatus } from "@platform/platform-db";

import { logger } from "../../observability/logger";
import type { PaymentProvider, ProviderPaymentStatus, ProviderSubscriptionStatus } from "../payments/provider";

type BillingReconciliationDeps = {
  db: any;
  paymentProvider: PaymentProvider;
};

type LocalPaymentStatus = "completed" | "pending" | "failed" | "refunded";

export type BillingReconciliationIssue = {
  type: "missing_local_payment" | "payment_status_mismatch" | "missing_local_subscription" | "subscription_status_mismatch";
  provider: PaymentProvider["name"];
  resourceId: string;
  message: string;
};

export type BillingReconciliationResult = {
  checkedAt: Date;
  issues: BillingReconciliationIssue[];
};

function normalizeProviderPaymentStatus(status: ProviderPaymentStatus | null | undefined): LocalPaymentStatus | null {
  if (!status) return null;
  if (status === "succeeded") return "completed";
  if (status === "complete") return "completed";
  if (status === "processing") return "pending";
  if (status === "cancelled") return "failed";

  return ["completed", "pending", "failed", "refunded"].includes(status) ? (status as LocalPaymentStatus) : null;
}

function normalizeProviderSubscriptionStatus(status: ProviderSubscriptionStatus | null | undefined): SubscriptionStatus | null {
  if (!status) return null;
  if (status === "cancelled") return "canceled";
  if (status === "failed") return "past_due";
  if (status === "on_hold") return "paused";
  if (status === "pending") return "trialing";

  return ["active", "trialing", "past_due", "canceled", "expired", "paused"].includes(status) ? (status as SubscriptionStatus) : null;
}

function serializeResult(result: BillingReconciliationResult) {
  return {
    checkedAt: result.checkedAt.toISOString(),
    issues: result.issues,
  };
}

export function createBillingReconciliationService(deps: BillingReconciliationDeps) {
  async function reconcileProviderBillingState(): Promise<BillingReconciliationResult> {
    const finance = deps.paymentProvider.finance;
    if (!finance?.listPayments || !finance.listSubscriptions) {
      throw new Error("Payment provider finance support is not configured");
    }

    const issues: BillingReconciliationIssue[] = [];
    const [providerPayments, providerSubscriptions] = await Promise.all([
      finance.listPayments({ pageSize: 100 }),
      finance.listSubscriptions({ pageSize: 100 }),
    ]);

    for (const payment of providerPayments.items) {
      const [localSubscriptionPayment, localCreditPurchase] = await Promise.all([
        deps.db.query.subscriptionPayments.findFirst({
          where: eq(subscriptionPayments.paymentId, payment.paymentId),
        }),
        deps.db.query.creditPurchases.findFirst({
          where: eq(creditPurchases.paymentId, payment.paymentId),
        }),
      ]);

      if (!localSubscriptionPayment && !localCreditPurchase) {
        issues.push({
          type: "missing_local_payment",
          provider: deps.paymentProvider.name,
          resourceId: payment.paymentId,
          message: "Provider payment is missing from local subscription payments and credit purchases.",
        });
        continue;
      }

      const localStatus = localSubscriptionPayment?.paymentStatus ?? localCreditPurchase?.paymentStatus;
      const providerStatus = normalizeProviderPaymentStatus(payment.status);
      if (providerStatus && localStatus && providerStatus !== localStatus) {
        issues.push({
          type: "payment_status_mismatch",
          provider: deps.paymentProvider.name,
          resourceId: payment.paymentId,
          message: `Provider payment status is ${providerStatus}, local status is ${localStatus}.`,
        });
      }
    }

    for (const subscription of providerSubscriptions.items) {
      const localSubscription = await deps.db.query.userSubscriptions.findFirst({
        where: or(
          eq(userSubscriptions.providerSubscriptionId, subscription.subscriptionId),
          eq(userSubscriptions.dodoSubscriptionId, subscription.subscriptionId),
        ),
      });

      if (!localSubscription) {
        issues.push({
          type: "missing_local_subscription",
          provider: deps.paymentProvider.name,
          resourceId: subscription.subscriptionId,
          message: "Provider subscription is missing from local subscriptions.",
        });
        continue;
      }

      const providerStatus = normalizeProviderSubscriptionStatus(subscription.status);
      if (providerStatus && providerStatus !== localSubscription.status) {
        issues.push({
          type: "subscription_status_mismatch",
          provider: deps.paymentProvider.name,
          resourceId: subscription.subscriptionId,
          message: `Provider subscription status is ${providerStatus}, local status is ${localSubscription.status}.`,
        });
      }
    }

    const result = { checkedAt: new Date(), issues };
    if (issues.length > 0) {
      logger.warn({ provider: deps.paymentProvider.name, issues }, "billing.reconciliation.drift");
    } else {
      logger.info({ provider: deps.paymentProvider.name }, "billing.reconciliation.clean");
    }

    return result;
  }

  async function reconcileProviderBillingStateSafely() {
    try {
      return await reconcileProviderBillingState();
    } catch (error) {
      logger.error({ provider: deps.paymentProvider.name, error }, "billing.reconciliation.failed");
      throw error;
    }
  }

  return {
    reconcileProviderBillingState,
    reconcileProviderBillingStateSafely,
    serializeResult,
  };
}
