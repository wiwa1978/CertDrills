import { inArray, or } from "drizzle-orm";

import {
  createPlatformDb,
  creditPurchases,
  subscriptionPayments,
  transactionOrders,
  userSubscriptions,
  type SubscriptionStatus,
  type TransactionOrderStatus,
} from "@platform/platform-db";

import { logger } from "../../observability/logger";
import type {
  PaymentProvider,
  ProviderListParams,
  ProviderListResult,
  ProviderPaymentListItem,
  ProviderPaymentStatus,
  ProviderSubscriptionListItem,
  ProviderSubscriptionStatus,
} from "../payments/provider";

type PlatformDb = ReturnType<typeof createPlatformDb>["db"];
type BillingReconciliationDeps = {
  db: PlatformDb;
  paymentProvider: PaymentProvider;
};

type LocalPaymentStatus = "completed" | "pending" | "failed" | "refunded";
type LocalPaymentKind = "credit_purchase" | "subscription_payment" | "transaction_order";

export type BillingReconciliationIssue = {
  type:
    | "missing_local_payment"
    | "missing_provider_payment"
    | "payment_status_mismatch"
    | "missing_local_subscription"
    | "missing_provider_subscription"
    | "subscription_status_mismatch";
  provider: PaymentProvider["name"];
  resourceId: string;
  localResourceType?: LocalPaymentKind | "subscription";
  message: string;
};

export type BillingReconciliationResult = {
  checkedAt: Date;
  issues: BillingReconciliationIssue[];
  counts: {
    providerPayments: number;
    providerSubscriptions: number;
    localPayments: number;
    localSubscriptions: number;
  };
};

const PAGE_SIZE = 100;
const QUERY_CHUNK_SIZE = 500;

function normalizeProviderPaymentStatus(status: ProviderPaymentStatus | null | undefined): LocalPaymentStatus | null {
  if (!status) return null;
  if (status === "succeeded" || status === "complete") return "completed";
  if (status === "processing") return "pending";
  if (status === "cancelled") return "failed";
  return ["completed", "pending", "failed", "refunded"].includes(status) ? (status as LocalPaymentStatus) : null;
}

function normalizeTransactionOrderStatus(status: TransactionOrderStatus): LocalPaymentStatus {
  if (status === "paid") return "completed";
  if (status === "refunded" || status === "partially_refunded") return "refunded";
  if (status === "pending_payment") return "pending";
  return "failed";
}

function normalizeProviderSubscriptionStatus(status: ProviderSubscriptionStatus | null | undefined): SubscriptionStatus | null {
  if (!status) return null;
  if (status === "cancelled") return "canceled";
  if (status === "failed") return "past_due";
  if (status === "on_hold") return "paused";
  if (status === "pending") return "trialing";
  return ["active", "trialing", "past_due", "canceled", "expired", "paused"].includes(status) ? (status as SubscriptionStatus) : null;
}

async function loadAllProviderPages<T>(loader: (params?: ProviderListParams) => Promise<ProviderListResult<T>>) {
  const rows: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await loader({ pageSize: PAGE_SIZE, cursor });
    rows.push(...page.items);
    const nextCursor = page.nextCursor ?? undefined;
    if (!nextCursor) break;
    if (seenCursors.has(nextCursor)) throw new Error("Payment provider returned a repeated pagination cursor");
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  } while (cursor);
  return rows;
}

async function loadInChunks<T>(ids: string[], loader: (chunk: string[]) => Promise<T[]>) {
  const rows: T[] = [];
  for (let offset = 0; offset < ids.length; offset += QUERY_CHUNK_SIZE) {
    rows.push(...await loader(ids.slice(offset, offset + QUERY_CHUNK_SIZE)));
  }
  return rows;
}

function serializeResult(result: BillingReconciliationResult) {
  return { ...result, checkedAt: result.checkedAt.toISOString() };
}

export function createBillingReconciliationService(deps: BillingReconciliationDeps) {
  async function reconcileProviderBillingState(): Promise<BillingReconciliationResult> {
    const finance = deps.paymentProvider.finance;
    if (!finance?.listPayments || !finance.listSubscriptions) {
      throw new Error("Payment provider finance support is not configured");
    }

    const [providerPayments, providerSubscriptions, allCreditPurchases, allSubscriptionPayments, allTransactionOrders, allLocalSubscriptions] = await Promise.all([
      loadAllProviderPages<ProviderPaymentListItem>(finance.listPayments),
      loadAllProviderPages<ProviderSubscriptionListItem>(finance.listSubscriptions),
      deps.db.select({ paymentId: creditPurchases.paymentId, status: creditPurchases.paymentStatus }).from(creditPurchases),
      deps.db.select({ paymentId: subscriptionPayments.paymentId, status: subscriptionPayments.paymentStatus }).from(subscriptionPayments),
      deps.db.select({ paymentId: transactionOrders.paymentId, status: transactionOrders.status }).from(transactionOrders),
      deps.db.select({ providerSubscriptionId: userSubscriptions.providerSubscriptionId, dodoSubscriptionId: userSubscriptions.dodoSubscriptionId, status: userSubscriptions.status }).from(userSubscriptions),
    ]);

    const issues: BillingReconciliationIssue[] = [];
    const providerPaymentIds = Array.from(new Set(providerPayments.map((payment) => payment.paymentId)));
    const providerSubscriptionIds = Array.from(new Set(providerSubscriptions.map((subscription) => subscription.subscriptionId)));
    const [matchingCreditPurchases, matchingSubscriptionPayments, matchingTransactionOrders, matchingSubscriptions] = await Promise.all([
      loadInChunks(providerPaymentIds, (ids) => deps.db.select({ paymentId: creditPurchases.paymentId, status: creditPurchases.paymentStatus }).from(creditPurchases).where(inArray(creditPurchases.paymentId, ids))),
      loadInChunks(providerPaymentIds, (ids) => deps.db.select({ paymentId: subscriptionPayments.paymentId, status: subscriptionPayments.paymentStatus }).from(subscriptionPayments).where(inArray(subscriptionPayments.paymentId, ids))),
      loadInChunks(providerPaymentIds, (ids) => deps.db.select({ paymentId: transactionOrders.paymentId, status: transactionOrders.status }).from(transactionOrders).where(inArray(transactionOrders.paymentId, ids))),
      loadInChunks(providerSubscriptionIds, (ids) => deps.db.select({ providerSubscriptionId: userSubscriptions.providerSubscriptionId, dodoSubscriptionId: userSubscriptions.dodoSubscriptionId, status: userSubscriptions.status }).from(userSubscriptions).where(or(inArray(userSubscriptions.providerSubscriptionId, ids), inArray(userSubscriptions.dodoSubscriptionId, ids)))),
    ]);

    const localPayments = new Map<string, { status: LocalPaymentStatus; kind: LocalPaymentKind }>();
    for (const row of matchingCreditPurchases) localPayments.set(row.paymentId, { status: row.status, kind: "credit_purchase" });
    for (const row of matchingSubscriptionPayments) localPayments.set(row.paymentId, { status: row.status as LocalPaymentStatus, kind: "subscription_payment" });
    for (const row of matchingTransactionOrders) {
      if (row.paymentId) localPayments.set(row.paymentId, { status: normalizeTransactionOrderStatus(row.status), kind: "transaction_order" });
    }

    for (const payment of providerPayments) {
      const local = localPayments.get(payment.paymentId);
      if (!local) {
        issues.push({ type: "missing_local_payment", provider: deps.paymentProvider.name, resourceId: payment.paymentId, message: "Provider payment is missing from all local billing records." });
        continue;
      }
      const providerStatus = normalizeProviderPaymentStatus(payment.status);
      if (providerStatus && providerStatus !== local.status) {
        issues.push({ type: "payment_status_mismatch", provider: deps.paymentProvider.name, resourceId: payment.paymentId, localResourceType: local.kind, message: `Provider payment status is ${providerStatus}, local status is ${local.status}.` });
      }
    }

    const providerPaymentSet = new Set(providerPaymentIds);
    const allLocalPayments = [
      ...allCreditPurchases.map((row) => ({ ...row, kind: "credit_purchase" as const })),
      ...allSubscriptionPayments.map((row) => ({ ...row, kind: "subscription_payment" as const })),
      ...allTransactionOrders.filter((row) => row.paymentId).map((row) => ({ paymentId: row.paymentId!, status: normalizeTransactionOrderStatus(row.status), kind: "transaction_order" as const })),
    ];
    for (const local of allLocalPayments) {
      if (!providerPaymentSet.has(local.paymentId)) {
        issues.push({ type: "missing_provider_payment", provider: deps.paymentProvider.name, resourceId: local.paymentId, localResourceType: local.kind, message: "Local payment is missing from the provider payment inventory." });
      }
    }

    const localSubscriptions = new Map<string, { status: SubscriptionStatus }>();
    for (const row of matchingSubscriptions) {
      if (row.providerSubscriptionId) localSubscriptions.set(row.providerSubscriptionId, row);
      if (row.dodoSubscriptionId) localSubscriptions.set(row.dodoSubscriptionId, row);
    }
    for (const subscription of providerSubscriptions) {
      const local = localSubscriptions.get(subscription.subscriptionId);
      if (!local) {
        issues.push({ type: "missing_local_subscription", provider: deps.paymentProvider.name, resourceId: subscription.subscriptionId, message: "Provider subscription is missing from local subscriptions." });
        continue;
      }
      const providerStatus = normalizeProviderSubscriptionStatus(subscription.status);
      if (providerStatus && providerStatus !== local.status) {
        issues.push({ type: "subscription_status_mismatch", provider: deps.paymentProvider.name, resourceId: subscription.subscriptionId, localResourceType: "subscription", message: `Provider subscription status is ${providerStatus}, local status is ${local.status}.` });
      }
    }

    const providerSubscriptionSet = new Set(providerSubscriptionIds);
    for (const local of allLocalSubscriptions) {
      const providerId = local.providerSubscriptionId ?? local.dodoSubscriptionId;
      if (providerId && !providerSubscriptionSet.has(providerId)) {
        issues.push({ type: "missing_provider_subscription", provider: deps.paymentProvider.name, resourceId: providerId, localResourceType: "subscription", message: "Local subscription is missing from the provider subscription inventory." });
      }
    }

    const result: BillingReconciliationResult = {
      checkedAt: new Date(),
      issues,
      counts: {
        providerPayments: providerPayments.length,
        providerSubscriptions: providerSubscriptions.length,
        localPayments: allLocalPayments.length,
        localSubscriptions: allLocalSubscriptions.length,
      },
    };
    if (issues.length) logger.warn({ provider: deps.paymentProvider.name, issueCount: issues.length }, "billing.reconciliation.drift");
    else logger.info({ provider: deps.paymentProvider.name }, "billing.reconciliation.clean");
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

  return { reconcileProviderBillingState, reconcileProviderBillingStateSafely, serializeResult };
}
