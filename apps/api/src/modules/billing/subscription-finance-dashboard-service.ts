import { and, count, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";

import {
  discounts,
  subscriptionEvents,
  subscriptionPayments,
  user,
  userSubscriptions,
  type SubscriptionStatus,
} from "@platform/platform-db";
import type { PlatformDb } from "@platform/platform-db";
import type { AdminSubscriptionFinanceDashboard } from "@platform/contracts";

import { subscriptionPlans } from "../../config/billing";
import type { PaymentProvider, ProviderLedgerEntry, ProviderPaymentListItem } from "../payments/provider";

type AdminSubscriptionFinanceDashboardServiceDeps = {
  db: PlatformDb;
  paymentProvider?: PaymentProvider;
};

type DashboardQuery = {
  range?: "7d" | "30d" | "90d" | "12m" | "ytd";
  startDate?: string;
  endDate?: string;
  grouping?: "day" | "week" | "month" | "year";
  currency?: string;
  planKey?: string;
  status?: SubscriptionStatus;
  search?: string;
  subscriptionsPage?: number;
  subscriptionsSearch?: string;
};

type LocalSubscriptionRow = AdminSubscriptionFinanceDashboard["subscriptions"]["rows"][number];
type LocalSubscriptionPagination = AdminSubscriptionFinanceDashboard["subscriptions"]["pagination"];
type LocalPaymentRow = AdminSubscriptionFinanceDashboard["transactions"]["localPayments"][number];
type LocalDiscountRow = AdminSubscriptionFinanceDashboard["discounts"]["rows"][number];
type LocalSubscriptionBaseRow = Omit<
  LocalSubscriptionRow,
  "latestPaymentId" | "amount" | "currency" | "paymentMethod" | "paymentMethodType"
>;
type LocalSubscriptionDbRow = Omit<
  LocalSubscriptionBaseRow,
  "createdAt" | "updatedAt" | "currentPeriodStart" | "currentPeriodEnd" | "providerEventAt"
> & {
  createdAt: Date;
  updatedAt: Date;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  providerEventAt: Date | null;
};
type LocalDiscountBaseRow = Omit<LocalDiscountRow, "providerDiscount">;
type ProviderList<T> = { items: T[]; nextCursor?: string | null };
type LocalSubscriptionsResult = {
  rows: LocalSubscriptionBaseRow[];
  allRows: LocalSubscriptionBaseRow[];
  pagination: LocalSubscriptionPagination;
};

const LIVE_PAGE_SIZE = 100;
const SUBSCRIPTIONS_PAGE_SIZE = 10;
const COMPLETED_PAYMENT_STATUS = "completed";
const ACTIVE_STATUSES = new Set(["active", "trialing"]);
const FAILED_PAYMENT_STATUSES = new Set(["failed", "cancelled", "requires_payment_method"]);
const SUCCESSFUL_PAYMENT_STATUSES = new Set(["completed", "refunded"]);

export function createAdminSubscriptionFinanceDashboardService(deps: AdminSubscriptionFinanceDashboardServiceDeps) {
  async function getDashboard(query: DashboardQuery = {}): Promise<AdminSubscriptionFinanceDashboard> {
    const filters = normalizeFilters(query);
    const { startDate, endDate } = getDateRange(filters);
    const warnings: AdminSubscriptionFinanceDashboard["warnings"] = [];

    const [subscriptionsResult, payments, events, localDiscounts] = await Promise.all([
      getLocalSubscriptions(filters),
      getLocalPayments(startDate, endDate, filters),
      getLocalEvents(startDate, endDate),
      getLocalDiscounts(),
    ]);

    const providerFinance = deps.paymentProvider?.finance;
    const [ledgerRows, providerPayments, providerSubscriptions, providerDiscounts, providerRefunds, providerProducts, providerDisputes, providerPayouts] = providerFinance
      ? await Promise.all([
          withProviderWarning(() => providerFinance.listBalanceLedgerEntries?.({ pageSize: LIVE_PAGE_SIZE, createdAtGte: startDate.toISOString(), createdAtLte: endDate.toISOString(), currency: filters.currency }), warnings, "payment-provider-ledger", "Payment provider ledger data is unavailable."),
          withProviderWarning(() => providerFinance.listPayments?.({ pageSize: LIVE_PAGE_SIZE, createdAtGte: startDate.toISOString(), createdAtLte: endDate.toISOString(), currency: filters.currency }), warnings, "payment-provider-payments", "Payment provider payment enrichment is unavailable."),
          withProviderWarning(() => providerFinance.listSubscriptions?.({ pageSize: LIVE_PAGE_SIZE, createdAtGte: startDate.toISOString(), createdAtLte: endDate.toISOString() }), warnings, "payment-provider-subscriptions", "Payment provider subscription enrichment is unavailable."),
          withProviderWarning(() => providerFinance.listDiscounts?.({ pageSize: LIVE_PAGE_SIZE }), warnings, "payment-provider-discounts", "Payment provider discount enrichment is unavailable."),
          withProviderWarning(() => providerFinance.listRefunds?.({ pageSize: LIVE_PAGE_SIZE, createdAtGte: startDate.toISOString(), createdAtLte: endDate.toISOString(), currency: filters.currency }), warnings, "payment-provider-refunds", "Payment provider refund data is unavailable."),
          withProviderWarning(() => providerFinance.listProducts?.({ pageSize: LIVE_PAGE_SIZE }), warnings, "payment-provider-products", "Payment provider product data is unavailable."),
          withProviderWarning(() => providerFinance.listDisputes?.({ pageSize: LIVE_PAGE_SIZE, createdAtGte: startDate.toISOString(), createdAtLte: endDate.toISOString() }), warnings, "payment-provider-disputes", "Payment provider dispute data is unavailable."),
          withProviderWarning(() => providerFinance.listPayouts?.({ pageSize: LIVE_PAGE_SIZE, createdAtGte: startDate.toISOString(), createdAtLte: endDate.toISOString() }), warnings, "payment-provider-payouts", "Payment provider payout data is unavailable."),
        ])
      : emptyProviderData(warnings);

    const enrichedSubscriptions = enrichSubscriptionsWithPayments(subscriptionsResult.rows, payments, providerPayments.items);
    const allSubscriptions = enrichSubscriptionsWithPayments(subscriptionsResult.allRows, payments, providerPayments.items);
    const completedPayments = payments.filter((payment) => payment.paymentStatus === COMPLETED_PAYMENT_STATUS);
    const grossIncomeCents = completedPayments.reduce((total, payment) => total + payment.priceInclVat, 0);
    const localNetIncomeCents = completedPayments.reduce((total, payment) => total + payment.priceExclVat, 0);
    const vatCents = completedPayments.reduce((total, payment) => total + payment.vatAmount, 0);
    const reconciliation = ledgerRows.items.length > 0
      ? reconcileLedger(ledgerRows.items)
      : {
          grossPayments: centsToMajor(grossIncomeCents),
          refunds: centsToMajor(payments.filter((payment) => payment.paymentStatus === "refunded" || payment.refundStatus).reduce((total, payment) => total + payment.priceInclVat, 0)),
          disputes: 0,
          fees: 0,
          tax: centsToMajor(vatCents),
          payouts: 0,
          netIncome: centsToMajor(localNetIncomeCents),
        };
    const recurringRevenue = calculateRecurringRevenue(allSubscriptions);
    const canceledInPeriod = allSubscriptions.filter((subscription) => subscription.status === "canceled" && isWithin(subscription.createdAt, startDate, endDate)).length;
    const activeSubscriptions = allSubscriptions.filter((subscription) => subscription.status === "active").length;

    return {
      filters,
      overview: {
        activeSubscriptions,
        trialingSubscriptions: allSubscriptions.filter((subscription) => subscription.status === "trialing").length,
        pastDueSubscriptions: allSubscriptions.filter((subscription) => subscription.status === "past_due").length,
        canceledSubscriptions: allSubscriptions.filter((subscription) => subscription.status === "canceled").length,
        monthlyRecurringRevenue: recurringRevenue.monthlyRecurringRevenue,
        annualRecurringRevenue: recurringRevenue.annualRecurringRevenue,
        grossIncome: centsToMajor(grossIncomeCents),
        netIncome: reconciliation.netIncome,
        refunds: reconciliation.refunds,
        discountsUsed: localDiscounts.reduce((total, discount) => total + discount.currentUses, 0),
        churnRate: activeSubscriptions + canceledInPeriod === 0 ? 0 : Number(((canceledInPeriod / (activeSubscriptions + canceledInPeriod)) * 100).toFixed(2)),
      },
      revenue: {
        grossSeries: groupPaymentsByPeriod(completedPayments, filters.grouping, startDate, endDate, "gross"),
        netSeries: groupPaymentsByPeriod(completedPayments, filters.grouping, startDate, endDate, "net"),
        cumulativeGrossSeries: groupCumulative(groupPaymentsByPeriod(completedPayments, filters.grouping, startDate, endDate, "gross")),
        cumulativeNetSeries: groupCumulative(groupPaymentsByPeriod(completedPayments, filters.grouping, startDate, endDate, "net")),
        newMrrSeries: groupNewMrrByPeriod(allSubscriptions, filters.grouping, startDate, endDate),
      },
      subscriptions: {
        rows: enrichedSubscriptions,
        pagination: subscriptionsResult.pagination,
        providerRows: providerSubscriptions.items,
        planDistribution: buildPlanDistribution(allSubscriptions),
        churn: {
          activeAtStart: activeSubscriptions + canceledInPeriod,
          canceledInPeriod,
          cancelAtPeriodEnd: allSubscriptions.filter((subscription) => subscription.cancelAtPeriodEnd).length,
          churnRate: activeSubscriptions + canceledInPeriod === 0 ? 0 : Number(((canceledInPeriod / (activeSubscriptions + canceledInPeriod)) * 100).toFixed(2)),
        },
      },
      transactions: {
        localPayments: payments,
        providerPayments: providerPayments.items,
        providerOnlyPayments: getProviderOnlyPayments(completedPayments, providerPayments.items),
        paymentAttemptSeries: groupPaymentAttemptsByPeriod(payments, filters.grouping, startDate, endDate),
        paymentAmountSeries: groupPaymentsByPeriod(completedPayments, filters.grouping, startDate, endDate, "gross"),
        events,
        ledgerRows: ledgerRows.items,
      },
      successRate: buildSuccessRate(payments, filters.grouping, startDate, endDate),
      accounting: {
        ledgerRows: ledgerRows.items,
        reconciliation,
      },
      refunds: {
        rows: providerRefunds.items,
        localRefundedPayments: payments.filter((payment) => payment.paymentStatus === "refunded" || Boolean(payment.refundStatus)),
        totalAmount: centsToMajor(providerRefunds.items.reduce((total, refund) => total + Math.abs(refund.amount?.amount ?? 0), 0)),
      },
      discounts: {
        rows: localDiscounts.map((discount) => ({
          ...discount,
          providerDiscount: providerDiscounts.items.find((providerDiscount) => providerDiscount.discountId === discount.providerDiscountId || providerDiscount.discountId === discount.dodoDiscountId) ?? null,
        })),
        providerRows: providerDiscounts.items,
      },
      products: {
        rows: providerProducts.items,
        recurringCount: providerProducts.items.filter((product) => product.isRecurring).length,
      },
      disputes: {
        rows: providerDisputes.items,
        openCount: providerDisputes.items.filter((dispute) => dispute.status && !["won", "lost", "closed"].includes(dispute.status)).length,
        totalAmount: centsToMajor(providerDisputes.items.reduce((total, dispute) => total + Math.abs(dispute.amount?.amount ?? 0), 0)),
      },
      payouts: {
        rows: providerPayouts.items,
        totalAmount: centsToMajor(providerPayouts.items.reduce((total, payout) => total + Math.abs(payout.amount?.amount ?? 0), 0)),
      },
      freshness: {
        localGeneratedAt: new Date().toISOString(),
        providerLiveDataAvailable: Boolean(providerFinance) && warnings.length === 0,
      },
      warnings,
    };
  }

  async function getLocalSubscriptions(filters: ReturnType<typeof normalizeFilters>): Promise<LocalSubscriptionsResult> {
    const where = buildSubscriptionWhere(filters, filters.subscriptionsSearch);
    const requestedPage = filters.subscriptionsPage;
    const totalResult = await deps.db
      .select({ count: count() })
      .from(userSubscriptions)
      .innerJoin(user, eq(userSubscriptions.userId, user.id))
      .where(where);
    const totalItems = Number(totalResult[0]?.count ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalItems / SUBSCRIPTIONS_PAGE_SIZE));
    const page = Math.min(requestedPage, totalPages);
    const [pageRows, allRows] = await Promise.all([
      deps.db
        .select({
          id: userSubscriptions.id,
          userId: userSubscriptions.userId,
          userName: user.name,
          userEmail: user.email,
          planKey: userSubscriptions.planKey,
          status: userSubscriptions.status,
          providerSubscriptionId: userSubscriptions.providerSubscriptionId,
          providerCustomerId: userSubscriptions.providerCustomerId,
          dodoSubscriptionId: userSubscriptions.dodoSubscriptionId,
          dodoCustomerId: userSubscriptions.dodoCustomerId,
          currentPeriodStart: userSubscriptions.currentPeriodStart,
          currentPeriodEnd: userSubscriptions.currentPeriodEnd,
          cancelAtPeriodEnd: userSubscriptions.cancelAtPeriodEnd,
          providerEventAt: userSubscriptions.providerEventAt,
          createdAt: userSubscriptions.createdAt,
          updatedAt: userSubscriptions.updatedAt,
        })
        .from(userSubscriptions)
        .innerJoin(user, eq(userSubscriptions.userId, user.id))
        .where(where)
        .orderBy(desc(userSubscriptions.createdAt))
        .limit(SUBSCRIPTIONS_PAGE_SIZE)
        .offset((page - 1) * SUBSCRIPTIONS_PAGE_SIZE),
      deps.db
        .select({
          id: userSubscriptions.id,
          userId: userSubscriptions.userId,
          userName: user.name,
          userEmail: user.email,
          planKey: userSubscriptions.planKey,
          status: userSubscriptions.status,
          providerSubscriptionId: userSubscriptions.providerSubscriptionId,
          providerCustomerId: userSubscriptions.providerCustomerId,
          dodoSubscriptionId: userSubscriptions.dodoSubscriptionId,
          dodoCustomerId: userSubscriptions.dodoCustomerId,
          currentPeriodStart: userSubscriptions.currentPeriodStart,
          currentPeriodEnd: userSubscriptions.currentPeriodEnd,
          cancelAtPeriodEnd: userSubscriptions.cancelAtPeriodEnd,
          providerEventAt: userSubscriptions.providerEventAt,
          createdAt: userSubscriptions.createdAt,
          updatedAt: userSubscriptions.updatedAt,
        })
        .from(userSubscriptions)
        .innerJoin(user, eq(userSubscriptions.userId, user.id))
        .where(buildSubscriptionWhere(filters, undefined))
        .orderBy(desc(userSubscriptions.createdAt))
        .limit(250),
    ]);

    return {
      rows: pageRows.map(toSubscriptionRow),
      allRows: allRows.map(toSubscriptionRow),
      pagination: {
        page,
        pageSize: SUBSCRIPTIONS_PAGE_SIZE,
        totalItems,
        totalPages,
        search: filters.subscriptionsSearch ?? "",
      },
    };
  }

  async function getLocalPayments(startDate: Date, endDate: Date, filters: ReturnType<typeof normalizeFilters>): Promise<LocalPaymentRow[]> {
    const conditions = [gte(subscriptionPayments.createdAt, startDate), lte(subscriptionPayments.createdAt, endDate)];
    if (filters.currency) conditions.push(eq(subscriptionPayments.currency, filters.currency));
    if (filters.planKey) conditions.push(eq(subscriptionPayments.planKey, filters.planKey));
    if (filters.search) {
      const search = `%${filters.search}%`;
      conditions.push(or(ilike(user.email, search), ilike(subscriptionPayments.paymentId, search), ilike(subscriptionPayments.dodoSubscriptionId, search))!);
    }

    const rows = await deps.db
      .select({
        id: subscriptionPayments.id,
        userId: subscriptionPayments.userId,
        userName: user.name,
        userEmail: user.email,
        planKey: subscriptionPayments.planKey,
        providerSubscriptionId: subscriptionPayments.providerSubscriptionId,
        dodoSubscriptionId: subscriptionPayments.dodoSubscriptionId,
        paymentId: subscriptionPayments.paymentId,
        paymentStatus: subscriptionPayments.paymentStatus,
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
      })
      .from(subscriptionPayments)
      .innerJoin(user, eq(subscriptionPayments.userId, user.id))
      .where(and(...conditions))
      .orderBy(desc(subscriptionPayments.createdAt))
      .limit(250);

    return rows.map((row) => ({ ...row, createdAt: toIso(row.createdAt) }));
  }

  async function getLocalEvents(startDate: Date, endDate: Date) {
    const rows = await deps.db
      .select({ id: subscriptionEvents.id, userId: subscriptionEvents.userId, providerSubscriptionId: subscriptionEvents.providerSubscriptionId, dodoSubscriptionId: subscriptionEvents.dodoSubscriptionId, eventType: subscriptionEvents.eventType, status: subscriptionEvents.status, createdAt: subscriptionEvents.createdAt })
      .from(subscriptionEvents)
      .where(and(gte(subscriptionEvents.createdAt, startDate), lte(subscriptionEvents.createdAt, endDate)))
      .orderBy(desc(subscriptionEvents.createdAt))
      .limit(100);

    return rows.map((row) => ({ ...row, createdAt: toIso(row.createdAt) }));
  }

  async function getLocalDiscounts(): Promise<LocalDiscountBaseRow[]> {
    const rows = await deps.db
      .select({ id: discounts.id, code: discounts.code, type: discounts.type, value: discounts.value, status: discounts.status, currentUses: discounts.currentUses, maxUses: discounts.maxUses, subscriptionCycles: discounts.subscriptionCycles, providerDiscountId: discounts.providerDiscountId, dodoDiscountId: discounts.dodoDiscountId })
      .from(discounts)
      .orderBy(desc(discounts.createdAt))
      .limit(100);

    return rows.map((row) => ({ ...row, value: Number(row.value ?? 0) }));
  }

  return { getDashboard };
}

function normalizeFilters(query: DashboardQuery) {
  return {
    range: query.range ?? "ytd",
    startDate: normalizeDateInput(query.startDate) ?? toDateInputValue(getRangeStartDate(query.range ?? "ytd")),
    endDate: normalizeDateInput(query.endDate) ?? toDateInputValue(new Date()),
    grouping: query.grouping ?? "day",
    currency: query.currency?.trim() || undefined,
    planKey: query.planKey?.trim() || undefined,
    status: query.status,
    search: query.search?.trim() || undefined,
    subscriptionsPage: positiveInteger(query.subscriptionsPage, 1),
    subscriptionsSearch: query.subscriptionsSearch?.trim() || undefined,
  };
}

function buildSubscriptionWhere(filters: ReturnType<typeof normalizeFilters>, tableSearch?: string) {
  const conditions = [];
  if (filters.planKey) conditions.push(eq(userSubscriptions.planKey, filters.planKey));
  if (filters.status) conditions.push(eq(userSubscriptions.status, filters.status));
  const search = tableSearch ?? filters.search;
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(ilike(user.email, pattern), ilike(userSubscriptions.providerSubscriptionId, pattern), ilike(userSubscriptions.dodoSubscriptionId, pattern))!);
  }
  return conditions.length > 0 ? and(...conditions) : sql`true`;
}

function getDateRange(filters: ReturnType<typeof normalizeFilters>) {
  const startDate = new Date(`${filters.startDate}T00:00:00.000Z`);
  const endDate = new Date(`${filters.endDate}T23:59:59.999Z`);
  if (startDate > endDate) {
    return {
      startDate: new Date(`${filters.endDate}T00:00:00.000Z`),
      endDate: new Date(`${filters.startDate}T23:59:59.999Z`),
    };
  }
  return { startDate, endDate };
}

function getRangeStartDate(range: "7d" | "30d" | "90d" | "12m" | "ytd") {
  const now = new Date();
  if (range === "ytd") return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const daysBack = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 365;
  const startDate = new Date(now);
  startDate.setUTCDate(startDate.getUTCDate() - daysBack);
  return startDate;
}

function normalizeDateInput(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : value;
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toSubscriptionRow(row: LocalSubscriptionDbRow): LocalSubscriptionBaseRow {
  return { ...row, createdAt: toIso(row.createdAt), updatedAt: toIso(row.updatedAt), currentPeriodStart: nullableIso(row.currentPeriodStart), currentPeriodEnd: nullableIso(row.currentPeriodEnd), providerEventAt: nullableIso(row.providerEventAt) };
}

function withProviderWarning<T>(loader: () => Promise<{ items: T[]; nextCursor?: string | null }> | undefined, warnings: AdminSubscriptionFinanceDashboard["warnings"], source: string, message: string) {
  if (!loader) return Promise.resolve({ items: [] as T[], nextCursor: null });
  const result = loader();
  if (!result) return Promise.resolve({ items: [] as T[], nextCursor: null });
  return result.catch(() => {
    warnings.push({ source, message });
    return { items: [] as T[], nextCursor: null };
  });
}

function emptyProviderData(warnings: AdminSubscriptionFinanceDashboard["warnings"]): [
  ProviderList<AdminSubscriptionFinanceDashboard["accounting"]["ledgerRows"][number]>,
  ProviderList<AdminSubscriptionFinanceDashboard["transactions"]["providerPayments"][number]>,
  ProviderList<AdminSubscriptionFinanceDashboard["subscriptions"]["providerRows"][number]>,
  ProviderList<AdminSubscriptionFinanceDashboard["discounts"]["providerRows"][number]>,
  ProviderList<AdminSubscriptionFinanceDashboard["refunds"]["rows"][number]>,
  ProviderList<AdminSubscriptionFinanceDashboard["products"]["rows"][number]>,
  ProviderList<AdminSubscriptionFinanceDashboard["disputes"]["rows"][number]>,
  ProviderList<AdminSubscriptionFinanceDashboard["payouts"]["rows"][number]>,
] {
  warnings.push({ source: "payment-provider-finance", message: "The active payment provider does not expose finance enrichment data. Showing local subscription data where possible." });
  return [
    { items: [], nextCursor: null },
    { items: [], nextCursor: null },
    { items: [], nextCursor: null },
    { items: [], nextCursor: null },
    { items: [], nextCursor: null },
    { items: [], nextCursor: null },
    { items: [], nextCursor: null },
    { items: [], nextCursor: null },
  ];
}

function enrichSubscriptionsWithPayments(rows: LocalSubscriptionBaseRow[], payments: LocalPaymentRow[], providerPayments: ProviderPaymentListItem[]) {
  return rows.map((subscription) => {
    const localPayment = payments.find((payment) => payment.dodoSubscriptionId === subscription.dodoSubscriptionId || payment.providerSubscriptionId === subscription.providerSubscriptionId);
    const providerPayment = providerPayments.find((payment) => payment.subscriptionId === subscription.dodoSubscriptionId || payment.subscriptionId === subscription.providerSubscriptionId);
    return {
      ...subscription,
      latestPaymentId: localPayment?.paymentId ?? providerPayment?.paymentId ?? null,
        amount: centsToMajor(localPayment?.priceInclVat ?? providerPayment?.amount?.amount ?? 0),
      currency: localPayment?.currency ?? providerPayment?.amount?.currency ?? "EUR",
      paymentMethod: localPayment?.paymentMethod ?? providerPayment?.paymentMethod ?? null,
      paymentMethodType: localPayment?.paymentMethodType ?? providerPayment?.paymentMethodType ?? null,
    };
  });
}

function calculateRecurringRevenue(subscriptions: LocalSubscriptionRow[]) {
  const monthlyRecurringRevenueCents = subscriptions.reduce((total, subscription) => ACTIVE_STATUSES.has(subscription.status) ? total + getSubscriptionMonthlyAmountCents(subscription.planKey) : total, 0);
  return { monthlyRecurringRevenue: centsToMajor(monthlyRecurringRevenueCents), annualRecurringRevenue: centsToMajor(monthlyRecurringRevenueCents * 12) };
}

function getSubscriptionMonthlyAmountCents(planKey: string) {
  const plan = subscriptionPlans.find((entry) => entry.key === planKey);
  if (!plan) return 0;
  return plan.interval === "year" ? Math.round(plan.price / 12) : plan.price;
}

function buildPlanDistribution(subscriptions: LocalSubscriptionRow[]) {
  const groups = new Map<string, number>();
  for (const subscription of subscriptions) groups.set(subscription.planKey, (groups.get(subscription.planKey) ?? 0) + 1);
  return Array.from(groups.entries()).map(([planKey, count]) => ({ planKey, count }));
}

function groupPaymentsByPeriod(payments: LocalPaymentRow[], grouping: "day" | "week" | "month" | "year", startDate: Date, endDate: Date, mode: "gross" | "net") {
  const groups = new Map<string, { amountCents: number; count: number }>();
  for (const payment of payments) {
    const period = periodKey(new Date(payment.createdAt), grouping);
    const existing = groups.get(period) ?? { amountCents: 0, count: 0 };
    groups.set(period, { amountCents: existing.amountCents + (mode === "gross" ? payment.priceInclVat : payment.priceExclVat), count: existing.count + 1 });
  }
  return periodsBetween(startDate, endDate, grouping).map((period) => ({ period, amount: centsToMajor(groups.get(period)?.amountCents ?? 0), amountCents: groups.get(period)?.amountCents ?? 0, count: groups.get(period)?.count ?? 0 }));
}

function groupPaymentAttemptsByPeriod(payments: LocalPaymentRow[], grouping: "day" | "week" | "month" | "year", startDate: Date, endDate: Date) {
  const successRows = payments.map((payment) => ({ date: new Date(payment.createdAt), succeeded: SUCCESSFUL_PAYMENT_STATUSES.has(payment.paymentStatus) }));
  return periodsBetween(startDate, endDate, grouping).map((period) => {
    const rows = successRows.filter((row) => periodKey(row.date, grouping) === period);
    const successful = rows.filter((row) => row.succeeded).length;
    return { period, amount: rows.length, amountCents: rows.length * 100, count: rows.length, successful };
  });
}

function groupNewMrrByPeriod(subscriptions: LocalSubscriptionRow[], grouping: "day" | "week" | "month" | "year", startDate: Date, endDate: Date) {
  const rows = subscriptions.filter((subscription) => ACTIVE_STATUSES.has(subscription.status) && isWithin(subscription.createdAt, startDate, endDate));
  const groups = new Map<string, { amountCents: number; count: number }>();
  for (const subscription of rows) {
    const period = periodKey(new Date(subscription.createdAt), grouping);
    const existing = groups.get(period) ?? { amountCents: 0, count: 0 };
    groups.set(period, { amountCents: existing.amountCents + getSubscriptionMonthlyAmountCents(subscription.planKey), count: existing.count + 1 });
  }
  return periodsBetween(startDate, endDate, grouping).map((period) => ({ period, amount: centsToMajor(groups.get(period)?.amountCents ?? 0), amountCents: groups.get(period)?.amountCents ?? 0, count: groups.get(period)?.count ?? 0 }));
}

function groupCumulative(rows: Array<{ period: string; amountCents: number; count: number }>) {
  let running = 0;
  return rows.map((row) => {
    running += row.amountCents;
    return { ...row, amountCents: running, amount: centsToMajor(running) };
  });
}

function buildSuccessRate(payments: LocalPaymentRow[], grouping: "day" | "week" | "month" | "year", startDate: Date, endDate: Date) {
  const total = payments.length;
  const successful = payments.filter((payment) => SUCCESSFUL_PAYMENT_STATUSES.has(payment.paymentStatus)).length;
  const failed = payments.filter((payment) => FAILED_PAYMENT_STATUSES.has(payment.paymentStatus)).length;
  return {
    totalAttempts: total,
    successfulPayments: successful,
    failedPayments: failed,
    rate: total === 0 ? 0 : Number(((successful / total) * 100).toFixed(2)),
    series: periodsBetween(startDate, endDate, grouping).map((period) => {
      const rows = payments.filter((payment) => periodKey(new Date(payment.createdAt), grouping) === period);
      const rowSuccessful = rows.filter((payment) => SUCCESSFUL_PAYMENT_STATUSES.has(payment.paymentStatus)).length;
      return { period, total: rows.length, successful: rowSuccessful, rate: rows.length === 0 ? 0 : Number(((rowSuccessful / rows.length) * 100).toFixed(2)) };
    }),
  };
}

function reconcileLedger(rows: ProviderLedgerEntry[]) {
  const totals = { grossPayments: 0, refunds: 0, disputes: 0, fees: 0, tax: 0, payouts: 0 };
  for (const row of rows) {
    const eventType = row.eventType;
    const amount = Math.abs(row.amount?.amount ?? 0);
    if (eventType === "payment") totals.grossPayments += amount;
    else if (eventType === "refund" || eventType === "refund_reversal") totals.refunds += eventType === "refund_reversal" ? -amount : amount;
    else if (eventType.startsWith("dispute")) totals.disputes += eventType === "dispute_reversal" ? -amount : amount;
    else if (eventType.includes("fees")) totals.fees += eventType.includes("reversal") ? -amount : amount;
    else if (eventType === "tax" || eventType === "tax_reversal") totals.tax += eventType === "tax_reversal" ? -amount : amount;
    else if (eventType === "payout" || eventType === "payout_reversal") totals.payouts += eventType === "payout_reversal" ? -amount : amount;
  }
  return {
    grossPayments: centsToMajor(totals.grossPayments),
    refunds: centsToMajor(totals.refunds),
    disputes: centsToMajor(totals.disputes),
    fees: centsToMajor(totals.fees),
    tax: centsToMajor(totals.tax),
    payouts: centsToMajor(totals.payouts),
    netIncome: centsToMajor(totals.grossPayments - totals.refunds - totals.disputes - totals.fees - totals.tax),
  };
}

function getProviderOnlyPayments(localPayments: LocalPaymentRow[], providerPayments: ProviderPaymentListItem[]) {
  const localIds = new Set(localPayments.map((payment) => payment.paymentId));
  return providerPayments.filter((payment) => !localIds.has(payment.paymentId));
}

function periodsBetween(startDate: Date, endDate: Date, grouping: "day" | "week" | "month" | "year") {
  const periods: string[] = [];
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  while (cursor <= endDate) {
    periods.push(periodKey(cursor, grouping));
    if (grouping === "day") cursor.setUTCDate(cursor.getUTCDate() + 1);
    else if (grouping === "week") cursor.setUTCDate(cursor.getUTCDate() + 7);
    else if (grouping === "month") cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
    else cursor.setUTCFullYear(cursor.getUTCFullYear() + 1, 0, 1);
  }
  return Array.from(new Set(periods));
}

function periodKey(date: Date, grouping: "day" | "week" | "month" | "year") {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (grouping === "week") {
    const day = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() - day + 1);
  } else if (grouping === "month") {
    utcDate.setUTCDate(1);
  } else if (grouping === "year") {
    utcDate.setUTCMonth(0, 1);
  }
  return utcDate.toISOString().slice(0, 10);
}

function positiveInteger(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && value && value > 0 ? Math.trunc(value) : fallback;
}

function centsToMajor(cents: number) {
  return Number((cents / 100).toFixed(2));
}

function isWithin(value: string, startDate: Date, endDate: Date) {
  const date = new Date(value);
  return date >= startDate && date <= endDate;
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function nullableIso(value: Date | string | null | undefined) {
  return value ? toIso(value) : null;
}
