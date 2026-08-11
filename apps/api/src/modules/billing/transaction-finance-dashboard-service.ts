import { and, desc, eq, exists, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";

import type {
  AdminTransactionFinanceDashboard,
  AdminTransactionFinanceDashboardQuery,
} from "@platform/contracts";
import {
  transactionEntitlements,
  transactionOrderItems,
  transactionOrders,
  user,
  type TransactionOrderStatus,
} from "@platform/platform-db";
import type { PlatformDb } from "@platform/platform-db";

import { transactionProducts } from "../../config/billing";
import type { PaymentProvider, ProviderListParams, ProviderRefundListItem } from "../payments/provider";

type ServiceDependencies = {
  db: PlatformDb;
  paymentProvider?: PaymentProvider;
  now?: () => Date;
};

type DashboardQuery = Partial<AdminTransactionFinanceDashboardQuery>;
type NormalizedFilters = AdminTransactionFinanceDashboard["filters"];
type DashboardOrder = AdminTransactionFinanceDashboard["orders"]["rows"][number];
type DashboardItem = DashboardOrder["items"][number];
type TransactionOrderItemRecord = typeof transactionOrderItems.$inferSelect;
type TransactionOrderRecord = typeof transactionOrders.$inferSelect;
type DashboardOrderSource = Pick<
  TransactionOrderRecord,
  "id" | "userId" | "status" | "currency" | "subtotalAmount" | "taxAmount" | "totalAmount" |
  "paymentProvider" | "paymentId" | "checkoutReferenceId" | "createdAt" | "paidAt" | "failedAt" | "fulfilledAt"
> & { userName: string | null; userEmail: string | null };
type DashboardCustomer = { name: string | null; email: string | null };
type Warning = AdminTransactionFinanceDashboard["warnings"][number];

const PAGE_SIZE = 20;
const PROVIDER_PAGE_SIZE = 100;
const ENRICHMENT_CHUNK_SIZE = 500;
export const MAX_ANALYTICS_ORDERS = 5_000;
export const MAX_PROVIDER_ROWS = 300;
const SUCCESSFUL_STATUSES = new Set<TransactionOrderStatus>(["paid", "refund_pending", "refunded", "partially_refunded"]);
const REFUNDED_STATUSES = new Set<TransactionOrderStatus>(["refunded", "partially_refunded"]);
const SUCCESSFUL_REFUND_STATUSES = new Set(["succeeded", "completed", "success", "refunded"]);

function transactionOrderPeriod(grouping: NormalizedFilters["grouping"]) {
  if (grouping === "day") return sql<string>`date_trunc('day', ${transactionOrders.createdAt})`;
  if (grouping === "week") return sql<string>`date_trunc('week', ${transactionOrders.createdAt})`;
  if (grouping === "month") return sql<string>`date_trunc('month', ${transactionOrders.createdAt})`;
  return sql<string>`date_trunc('year', ${transactionOrders.createdAt})`;
}

export function createAdminTransactionFinanceDashboardService(deps: ServiceDependencies) {
  async function getDashboard(query: DashboardQuery = {}): Promise<AdminTransactionFinanceDashboard> {
    const now = deps.now?.() ?? new Date();
    const filters = normalizeAdminTransactionDashboardQuery(query, now);
    const startDate = new Date(`${filters.startDate}T00:00:00.000Z`);
    const nextDayStart = new Date(`${filters.endDate}T00:00:00.000Z`);
    nextDayStart.setUTCDate(nextDayStart.getUTCDate() + 1);
    const conditions = [gte(transactionOrders.createdAt, startDate), lt(transactionOrders.createdAt, nextDayStart)];
    if (filters.status) conditions.push(eq(transactionOrders.status, filters.status));
    if (filters.currency) conditions.push(eq(transactionOrders.currency, filters.currency));
    if (filters.productKey) {
      conditions.push(exists(
        deps.db.select({ one: sql`1` })
          .from(transactionOrderItems)
          .where(and(
            eq(transactionOrderItems.orderId, transactionOrders.id),
            eq(transactionOrderItems.productKey, filters.productKey),
          )),
      ));
    }
    if (filters.search) {
      const pattern = adminTransactionSearchPattern(filters.search);
      conditions.push(or(
        sql`${transactionOrders.id}::text ILIKE ${pattern} ESCAPE '\\'`,
        ilike(transactionOrders.paymentId, pattern),
        ilike(transactionOrders.checkoutReferenceId, pattern),
        sql`${transactionOrders.userId}::text ILIKE ${pattern} ESCAPE '\\'`,
        exists(
          deps.db.select({ one: sql`1` })
            .from(user)
            .where(and(
              eq(user.id, transactionOrders.userId),
              or(ilike(user.name, pattern), ilike(user.email, pattern)),
            )),
        ),
      )!);
    }

    const period = transactionOrderPeriod(filters.grouping);
    const pageOffset = (filters.page - 1) * PAGE_SIZE;
    const successfulStatusList: TransactionOrderStatus[] = ["paid", "refund_pending", "refunded", "partially_refunded"];
    const [
      pageOrders,
      totalResult,
      overviewRows,
      revenueRows,
      attemptRows,
      productRows,
      trendAggregates,
    ] = await Promise.all([
      deps.db
        .select({
          id: transactionOrders.id,
          userId: transactionOrders.userId,
          status: transactionOrders.status,
          currency: transactionOrders.currency,
          subtotalAmount: transactionOrders.subtotalAmount,
          taxAmount: transactionOrders.taxAmount,
          totalAmount: transactionOrders.totalAmount,
          paymentProvider: transactionOrders.paymentProvider,
          paymentId: transactionOrders.paymentId,
          checkoutReferenceId: transactionOrders.checkoutReferenceId,
          createdAt: transactionOrders.createdAt,
          paidAt: transactionOrders.paidAt,
          failedAt: transactionOrders.failedAt,
          fulfilledAt: transactionOrders.fulfilledAt,
          userName: user.name,
          userEmail: user.email,
        })
        .from(transactionOrders)
        .leftJoin(user, eq(user.id, transactionOrders.userId))
        .where(and(...conditions))
        .orderBy(desc(transactionOrders.createdAt), desc(transactionOrders.id))
        .limit(PAGE_SIZE)
        .offset(pageOffset),
      deps.db.select({ count: sql<number>`count(*)::int` }).from(transactionOrders).where(and(...conditions)),
      deps.db
        .select({
          currency: transactionOrders.currency,
          totalAttempts: sql<number>`count(*)::int`,
          successfulOrders: sql<number>`count(*) filter (where ${transactionOrders.status} in ('paid', 'refund_pending', 'refunded', 'partially_refunded'))::int`,
          pendingAttempts: sql<number>`count(*) filter (where ${transactionOrders.status} = 'pending_payment')::int`,
          failedAttempts: sql<number>`count(*) filter (where ${transactionOrders.status} = 'failed')::int`,
          cancelledAttempts: sql<number>`count(*) filter (where ${transactionOrders.status} = 'cancelled')::int`,
          refundedOrders: sql<number>`count(*) filter (where ${transactionOrders.status} in ('refunded', 'partially_refunded'))::int`,
          grossRevenue: sql<number>`coalesce(sum(${transactionOrders.totalAmount}) filter (where ${transactionOrders.status} in ('paid', 'refund_pending', 'refunded', 'partially_refunded')), 0)::bigint`,
          preTaxRevenue: sql<number>`coalesce(sum(${transactionOrders.subtotalAmount}) filter (where ${transactionOrders.status} in ('paid', 'refund_pending', 'refunded', 'partially_refunded')), 0)::bigint`,
          taxCollected: sql<number>`coalesce(sum(${transactionOrders.taxAmount}) filter (where ${transactionOrders.status} in ('paid', 'refund_pending', 'refunded', 'partially_refunded')), 0)::bigint`,
          refundedAmount: sql<number>`coalesce(sum(${transactionOrders.totalAmount}) filter (where ${transactionOrders.status} = 'refunded'), 0)::bigint`,
          partialRefunds: sql<number>`count(*) filter (where ${transactionOrders.status} = 'partially_refunded')::int`,
        })
        .from(transactionOrders)
        .where(and(...conditions))
        .groupBy(transactionOrders.currency),
      deps.db
        .select({
          period,
          currency: transactionOrders.currency,
          amount: sql<number>`sum(${transactionOrders.totalAmount})::bigint`,
        })
        .from(transactionOrders)
        .where(and(...conditions, inArray(transactionOrders.status, successfulStatusList)))
        .groupBy(period, transactionOrders.currency)
        .orderBy(period),
      deps.db
        .select({
          period,
          success: sql<number>`count(*) filter (where ${transactionOrders.status} in ('paid', 'refund_pending', 'refunded', 'partially_refunded'))::int`,
          failed: sql<number>`count(*) filter (where ${transactionOrders.status} = 'failed')::int`,
          pending: sql<number>`count(*) filter (where ${transactionOrders.status} = 'pending_payment')::int`,
          cancelled: sql<number>`count(*) filter (where ${transactionOrders.status} = 'cancelled')::int`,
        })
        .from(transactionOrders)
        .where(and(...conditions))
        .groupBy(period)
        .orderBy(period),
      deps.db
        .select({
          productKey: transactionOrderItems.productKey,
          currency: transactionOrderItems.currency,
          unitsSold: sql<number>`sum(${transactionOrderItems.quantity})::int`,
          orderCount: sql<number>`count(distinct ${transactionOrderItems.orderId})::int`,
          grossRevenue: sql<number>`sum(${transactionOrderItems.totalAmount})::bigint`,
          name: sql<string | null>`max(${transactionOrderItems.metadata}->>'name')`,
        })
        .from(transactionOrderItems)
        .innerJoin(transactionOrders, eq(transactionOrders.id, transactionOrderItems.orderId))
        .where(and(...conditions, inArray(transactionOrders.status, successfulStatusList)))
        .groupBy(transactionOrderItems.productKey, transactionOrderItems.currency)
        .orderBy(transactionOrderItems.productKey, transactionOrderItems.currency),
      loadTrendAggregates(deps.db, now),
    ]);

    const orderIds = pageOrders.map((order: { id: string }) => order.id);
    const paidOrderIds = pageOrders.filter((order: { id: string; status: TransactionOrderStatus }) => order.status === "paid").map((order: { id: string }) => order.id);
    const [rawItems, paidEntitlements] = await Promise.all([
      orderIds.length ? deps.db.query.transactionOrderItems.findMany({ where: inArray(transactionOrderItems.orderId, orderIds) }) : [],
      paidOrderIds.length ? deps.db.query.transactionEntitlements.findMany({
        where: inArray(transactionEntitlements.orderId, paidOrderIds),
        columns: { orderId: true, status: true },
      }) : [],
    ]);
    const itemsByOrderId = groupItems(rawItems);
    const rows: DashboardOrder[] = pageOrders.map((order) => toDashboardOrder(
      order,
      itemsByOrderId.get(order.id) ?? [],
      { name: order.userName, email: order.userEmail },
    ));
    const consumedOrderIds = new Set(paidEntitlements.filter((entitlement) => entitlement.status === "consumed").map((entitlement) => entitlement.orderId));
    const warnings: Warning[] = [];
    const partialRefundCount = overviewRows.reduce((total: number, row: { partialRefunds: number }) => total + Number(row.partialRefunds), 0);
    if (partialRefundCount > 0) warnings.push({ source: "local-partial-refunds", message: `Exact amount is unavailable for ${partialRefundCount} partial refund${partialRefundCount === 1 ? "" : "s"}.` });

    const providerFinance = deps.paymentProvider?.finance;
    const financeCapabilities = deps.paymentProvider?.capabilities?.finance;
    const supportsRefunds = financeCapabilities?.refunds !== false && Boolean(providerFinance?.listRefunds);
    const supportsProducts = financeCapabilities?.products !== false && Boolean(providerFinance?.listProducts);
    const [providerRefundsResult, providerProductsResult] = await Promise.all([
      loadProviderPages(supportsRefunds ? providerFinance!.listRefunds! : undefined, { currency: filters.currency }, (row) => row.refundId, warnings, "payment-provider-refunds", "Payment provider refund enrichment is unavailable."),
      loadProviderPages(supportsProducts ? providerFinance!.listProducts! : undefined, {}, (row) => row.productId, warnings, "payment-provider-products", "Payment provider product enrichment is unavailable."),
    ]);
    const providerRefunds = providerRefundsResult.items;
    const providerProducts = providerProductsResult.items;
    const selectedOrdersByPayment = new Map(rows.flatMap((order) => order.paymentId
      ? [[providerPaymentKey(order.paymentProvider, order.paymentId), order] as const]
      : []));
    const safeProviderRefunds = providerRefunds.map(stripRaw).filter((refund) => {
      const order = selectedOrdersByPayment.get(providerPaymentKey(refund.provider, refund.paymentId));
      const refundCurrency = refund.amount?.currency;
      if (!order || !refundCurrency) return false;
      return SUCCESSFUL_REFUND_STATUSES.has(String(refund.status).toLowerCase())
        && refundCurrency.toUpperCase() === order.currency.toUpperCase();
    });
    const configuredProviderProductIds = new Set(transactionProducts
      .filter((product) => product.active && (!filters.productKey || product.key === filters.productKey))
      .map((product) => (product.providerProductIds as Record<string, string>)[deps.paymentProvider?.name ?? ""]?.trim())
      .filter((productId): productId is string => Boolean(productId)));
    const safeProviderProducts = providerProducts
      .map(stripRaw)
      .filter((product) => configuredProviderProductIds.has(product.productId));

    const refundedRows = rows.filter((order: DashboardOrder) => REFUNDED_STATUSES.has(order.status));
    const refundTotals = new Map<string, number>(overviewRows.map((row): [string, number] => [String(row.currency).toUpperCase(), Number(row.refundedAmount)]));
    if (filters.currency && !refundTotals.has(filters.currency)) refundTotals.set(filters.currency, 0);
    const totalItems = Number(totalResult[0]?.count ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

    return {
      filters,
      warnings,
      overview: buildSqlOverview(overviewRows, filters.currency),
      revenue: buildSqlRevenueSeries(revenueRows, filters),
      attempts: buildSqlAttemptSeries(attemptRows, filters),
      successRate: buildSqlAttemptSeries(attemptRows, filters).map((point) => ({
        period: point.period,
        total: point.success + point.failed + point.pending + point.cancelled,
        successful: point.success,
        rate: point.success + point.failed + point.pending + point.cancelled === 0
          ? 0
          : percentage(point.success, point.success + point.failed + point.pending + point.cancelled),
      })),
      orderTrends: trendAggregates,
      orders: {
        rows,
        pagination: { page: Math.min(filters.page, totalPages), pageSize: PAGE_SIZE, totalItems, totalPages },
      },
      refunds: {
        refundableRows: rows.filter((order: DashboardOrder) => order.status === "paid" && !consumedOrderIds.has(order.id)),
        localRows: refundedRows,
        providerRows: safeProviderRefunds as AdminTransactionFinanceDashboard["refunds"]["providerRows"],
        totalAmounts: moneyTotals(refundTotals),
      },
      products: {
        rows: productRows.map((row) => ({
          productKey: row.productKey,
          name: row.name ?? transactionProducts.find((product) => product.key === row.productKey)?.name ?? row.productKey,
          unitsSold: Number(row.unitsSold),
          orderCount: Number(row.orderCount),
          grossRevenue: centsToMajor(Number(row.grossRevenue)),
          currency: row.currency,
        })),
        providerRows: safeProviderProducts as AdminTransactionFinanceDashboard["products"]["providerRows"],
      },
    };
  }

  return { getDashboard };
}

export function normalizeAdminTransactionDashboardQuery(query: DashboardQuery, now: Date): NormalizedFilters {
  const range = query.range ?? "30d";
  if (range === "custom") validateCustomRange(query.startDate, query.endDate);
  const endDate = range === "custom" && query.endDate ? query.endDate : dateKey(now);
  const startDate = range === "custom" && query.startDate
    ? query.startDate
    : dateKey(subtractInclusiveRange(now, range === "7d" ? 7 : range === "90d" ? 90 : range === "12m" ? 365 : 30));
  return {
    range,
    startDate,
    endDate,
    grouping: query.grouping ?? defaultGrouping(startDate, endDate),
    currency: query.currency?.trim().toUpperCase() || undefined,
    status: query.status,
    productKey: query.productKey?.trim() || undefined,
    search: query.search?.trim() || undefined,
    page: positiveInteger(query.page, 1),
    pageSize: PAGE_SIZE,
  };
}

function buildSqlOverview(rows: Array<Record<string, unknown>>, filteredCurrency: string | undefined): AdminTransactionFinanceDashboard["overview"] {
  const amounts = rows.map((row) => ({
    currency: String(row.currency).toUpperCase(),
    grossRevenue: centsToMajor(Number(row.grossRevenue)),
    preTaxRevenue: centsToMajor(Number(row.preTaxRevenue)),
    taxCollected: centsToMajor(Number(row.taxCollected)),
    refundedAmount: centsToMajor(Number(row.refundedAmount)),
  }));
  if (filteredCurrency && !amounts.some((row) => row.currency === filteredCurrency)) {
    amounts.push({ currency: filteredCurrency, grossRevenue: 0, preTaxRevenue: 0, taxCollected: 0, refundedAmount: 0 });
  }
  const totals = rows.reduce<{
    successfulOrders: number;
    pendingAttempts: number;
    failedAttempts: number;
    cancelledAttempts: number;
    refundedOrders: number;
    totalAttempts: number;
  }>((current, row) => ({
    successfulOrders: current.successfulOrders + Number(row.successfulOrders),
    pendingAttempts: current.pendingAttempts + Number(row.pendingAttempts),
    failedAttempts: current.failedAttempts + Number(row.failedAttempts),
    cancelledAttempts: current.cancelledAttempts + Number(row.cancelledAttempts),
    refundedOrders: current.refundedOrders + Number(row.refundedOrders),
    totalAttempts: current.totalAttempts + Number(row.totalAttempts),
  }), { successfulOrders: 0, pendingAttempts: 0, failedAttempts: 0, cancelledAttempts: 0, refundedOrders: 0, totalAttempts: 0 });
  return {
    amounts: amounts.sort((left, right) => left.currency.localeCompare(right.currency)),
    ...totals,
    conversionRate: totals.totalAttempts === 0 ? 0 : percentage(totals.successfulOrders, totals.totalAttempts),
  };
}

function buildSqlRevenueSeries(rows: Array<Record<string, unknown>>, filters: NormalizedFilters): AdminTransactionFinanceDashboard["revenue"] {
  const totals = new Map<string, number>();
  const currencies = new Set<string>();
  for (const row of rows) {
    const currency = String(row.currency).toUpperCase();
    const period = periodKey(new Date(String(row.period)), filters.grouping);
    currencies.add(currency);
    totals.set(`${currency}\u0000${period}`, Number(row.amount));
  }
  if (filters.currency) currencies.add(filters.currency);
  return Array.from(currencies).sort().flatMap((currency) => periodsBetween(filters).map((period) => ({
    period,
    amount: centsToMajor(totals.get(`${currency}\u0000${period}`) ?? 0),
    currency,
  })));
}

function buildSqlAttemptSeries(rows: Array<Record<string, unknown>>, filters: NormalizedFilters): AdminTransactionFinanceDashboard["attempts"] {
  const totals = new Map(rows.map((row) => [periodKey(new Date(String(row.period)), filters.grouping), row]));
  return periodsBetween(filters).map((period) => {
    const row = totals.get(period);
    return {
      period,
      success: Number(row?.success ?? 0),
      failed: Number(row?.failed ?? 0),
      pending: Number(row?.pending ?? 0),
      cancelled: Number(row?.cancelled ?? 0),
    };
  });
}

async function loadTrendAggregates(db: PlatformDb, now: Date): Promise<AdminTransactionFinanceDashboard["orderTrends"]> {
  const definitions = [
    { range: "30d" as const, days: 30, grouping: "day" as const },
    { range: "90d" as const, days: 90, grouping: "week" as const },
    { range: "180d" as const, days: 180, grouping: "month" as const },
  ];
  return Promise.all(definitions.map(async ({ range, days, grouping }) => {
    const start = subtractInclusiveRange(now, days);
    start.setUTCHours(0, 0, 0, 0);
    const nextDay = new Date(now);
    nextDay.setUTCHours(0, 0, 0, 0);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const groupedPeriod = transactionOrderPeriod(grouping);
    const rows = await db
      .select({
        period: groupedPeriod,
        total: sql<number>`count(*)::int`,
        successful: sql<number>`count(*) filter (where ${transactionOrders.status} in ('paid', 'refund_pending', 'refunded', 'partially_refunded'))::int`,
        failed: sql<number>`count(*) filter (where ${transactionOrders.status} = 'failed')::int`,
      })
      .from(transactionOrders)
      .where(and(gte(transactionOrders.createdAt, start), lt(transactionOrders.createdAt, nextDay)))
      .groupBy(groupedPeriod)
      .orderBy(groupedPeriod);
    const byPeriod = new Map<string, Record<string, unknown>>(rows.map((row: Record<string, unknown>): [string, Record<string, unknown>] => [periodKey(new Date(String(row.period)), grouping), row]));
    const points = periodsBetween({ startDate: dateKey(start), endDate: dateKey(now), grouping }).map((period) => {
      const row = byPeriod.get(period);
      return { period, total: Number(row?.total ?? 0), successful: Number(row?.successful ?? 0), failed: Number(row?.failed ?? 0) };
    });
    return {
      range,
      total: points.reduce((sum, point) => sum + point.total, 0),
      successful: points.reduce((sum, point) => sum + point.successful, 0),
      failed: points.reduce((sum, point) => sum + point.failed, 0),
      points,
    };
  }));
}

function validateCustomRange(startDate: string | undefined, endDate: string | undefined) {
  if (!startDate || !endDate || !isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) {
    throw new Error("Invalid custom transaction dashboard range");
  }
  if (inclusiveDays(startDate, endDate) > 366) throw new Error("Custom transaction dashboard range cannot exceed 366 days");
}

function isIsoDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.getTime()) && dateKey(parsed) === value;
}

function inclusiveDays(startDate: string, endDate: string) {
  return Math.floor((Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / 86_400_000) + 1;
}

function subtractInclusiveRange(now: Date, days: number) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - days + 1);
  return date;
}

function defaultGrouping(startDate: string, endDate: string): NormalizedFilters["grouping"] {
  const days = Math.floor((new Date(`${endDate}T00:00:00.000Z`).getTime() - new Date(`${startDate}T00:00:00.000Z`).getTime()) / 86_400_000) + 1;
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  if (days <= 730) return "month";
  return "year";
}

function groupItems(items: TransactionOrderItemRecord[]) {
  const grouped = new Map<string, TransactionOrderItemRecord[]>();
  for (const item of items) grouped.set(item.orderId, [...(grouped.get(item.orderId) ?? []), item]);
  return grouped;
}

function toDashboardOrder(order: DashboardOrderSource, items: TransactionOrderItemRecord[], customer: DashboardCustomer): DashboardOrder {
  return {
    id: order.id,
    userId: order.userId,
    userName: customer?.name ?? null,
    userEmail: customer?.email ?? "",
    status: order.status,
    currency: order.currency,
    subtotalAmount: Number(order.subtotalAmount),
    taxAmount: Number(order.taxAmount),
    totalAmount: Number(order.totalAmount),
    paymentProvider: order.paymentProvider,
    paymentId: order.paymentId ?? null,
    checkoutReferenceId: order.checkoutReferenceId ?? null,
    createdAt: toIso(order.createdAt),
    paidAt: nullableIso(order.paidAt),
    failedAt: nullableIso(order.failedAt),
    fulfilledAt: nullableIso(order.fulfilledAt),
    items: items.map(toDashboardItem),
  };
}

function toDashboardItem(item: TransactionOrderItemRecord): DashboardItem {
  const configuredProduct = transactionProducts.find((product) => product.key === item.productKey);
  return {
    id: item.id,
    productKey: item.productKey,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    totalAmount: Number(item.totalAmount),
    currency: item.currency,
    providerProductId: item.providerProductId ?? null,
    name: metadataString(item.metadata, "name") ?? configuredProduct?.name ?? item.productKey,
    description: metadataString(item.metadata, "description") ?? configuredProduct?.description ?? null,
  };
}

function matchesSearch(order: DashboardOrder, search: string | undefined) {
  if (!search) return true;
  const needle = search.toLowerCase();
  return [order.id, order.userId, order.userName, order.userEmail, order.paymentId, order.checkoutReferenceId]
    .some((value) => value?.toLowerCase().includes(needle));
}

export function matchesAdminTransactionSearch(order: Record<string, unknown>, customer: Record<string, unknown> | undefined, search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [order.id, order.paymentId, order.checkoutReferenceId, order.userId, customer?.id, customer?.name, customer?.email]
    .some((value) => typeof value === "string" && value.toLowerCase().includes(needle));
}

export function adminTransactionSearchPattern(value: string) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

function buildOverview(rows: DashboardOrder[], successfulRows: DashboardOrder[], refundedRows: DashboardOrder[], refundTotals: Map<string, number>, filteredCurrency: string | undefined) {
  const amounts = new Map<string, { grossRevenue: number; preTaxRevenue: number; taxCollected: number }>();
  for (const order of successfulRows) {
    const currency = order.currency.toUpperCase();
    const current = amounts.get(currency) ?? { grossRevenue: 0, preTaxRevenue: 0, taxCollected: 0 };
    current.grossRevenue += order.totalAmount;
    current.preTaxRevenue += order.subtotalAmount;
    current.taxCollected += order.taxAmount;
    amounts.set(currency, current);
  }
  const currencies = new Set([...amounts.keys(), ...refundTotals.keys()]);
  if (filteredCurrency) currencies.add(filteredCurrency);
  return {
    amounts: Array.from(currencies).sort().map((currency) => ({
      currency,
      grossRevenue: centsToMajor(amounts.get(currency)?.grossRevenue ?? 0),
      preTaxRevenue: centsToMajor(amounts.get(currency)?.preTaxRevenue ?? 0),
      taxCollected: centsToMajor(amounts.get(currency)?.taxCollected ?? 0),
      refundedAmount: centsToMajor(refundTotals.get(currency) ?? 0),
    })),
    successfulOrders: successfulRows.length,
    pendingAttempts: rows.filter((order) => order.status === "pending_payment").length,
    failedAttempts: rows.filter((order) => order.status === "failed").length,
    cancelledAttempts: rows.filter((order) => order.status === "cancelled").length,
    refundedOrders: refundedRows.length,
    conversionRate: rows.length === 0 ? 0 : percentage(successfulRows.length, rows.length),
    totalAttempts: rows.length,
  };
}

function buildRevenueSeries(rows: DashboardOrder[], filters: NormalizedFilters) {
  const totals = new Map<string, number>();
  const currencies = new Set<string>();
  for (const order of rows) {
    const currency = order.currency.toUpperCase();
    const period = periodKey(new Date(order.createdAt), filters.grouping);
    const key = `${currency}\u0000${period}`;
    currencies.add(currency);
    totals.set(key, (totals.get(key) ?? 0) + order.totalAmount);
  }
  if (filters.currency) currencies.add(filters.currency);
  return Array.from(currencies).sort().flatMap((currency) => periodsBetween(filters).map((period) => ({
    period,
    amount: centsToMajor(totals.get(`${currency}\u0000${period}`) ?? 0),
    currency,
  })));
}

function buildRefundTotals(refundedRows: DashboardOrder[], providerRefunds: Array<Omit<ProviderRefundListItem, "raw">>, providerRefundsComplete: boolean, filteredCurrency: string | undefined, warnings: Warning[]) {
  const totals = new Map<string, number>();
  const paymentsWithExactProviderAmounts = new Set<string>();
  if (providerRefundsComplete) {
    for (const refund of providerRefunds) {
      if (!refund.amount || typeof refund.amount.amount !== "number" || !refund.amount.currency) continue;
      const currency = String(refund.amount.currency).toUpperCase();
      totals.set(currency, (totals.get(currency) ?? 0) + Math.abs(refund.amount.amount));
      if (refund.paymentId) paymentsWithExactProviderAmounts.add(providerPaymentKey(refund.provider, refund.paymentId));
    }
  }

  let unknownPartialRefunds = 0;
  for (const order of refundedRows) {
    if (order.paymentId && paymentsWithExactProviderAmounts.has(providerPaymentKey(order.paymentProvider, order.paymentId))) continue;
    const currency = order.currency.toUpperCase();
    if (order.status === "refunded") totals.set(currency, (totals.get(currency) ?? 0) + order.totalAmount);
    else {
      unknownPartialRefunds += 1;
      if (!totals.has(currency)) totals.set(currency, 0);
    }
  }
  if (filteredCurrency) totals.set(filteredCurrency, totals.get(filteredCurrency) ?? 0);
  if (unknownPartialRefunds > 0) {
    warnings.push({
      source: "local-partial-refunds",
      message: `Exact amount is unavailable for ${unknownPartialRefunds} partial refund${unknownPartialRefunds === 1 ? "" : "s"}.`,
    });
  }
  return totals;
}

function providerPaymentKey(provider: unknown, paymentId: unknown) {
  return `${String(provider ?? "").trim().toLowerCase()}\u0000${String(paymentId ?? "")}`;
}

function moneyTotals(totals: Map<string, number>) {
  return Array.from(totals.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([currency, amount]) => ({ currency, amount: centsToMajor(amount) }));
}

function buildAttemptSeries(rows: DashboardOrder[], filters: NormalizedFilters) {
  return periodsBetween(filters).map((period) => {
    const periodRows = rows.filter((order) => periodKey(new Date(order.createdAt), filters.grouping) === period);
    return {
      period,
      success: periodRows.filter((order) => SUCCESSFUL_STATUSES.has(order.status)).length,
      failed: periodRows.filter((order) => order.status === "failed").length,
      pending: periodRows.filter((order) => order.status === "pending_payment").length,
      cancelled: periodRows.filter((order) => order.status === "cancelled").length,
    };
  });
}

function buildSuccessRateSeries(rows: DashboardOrder[], filters: NormalizedFilters) {
  return periodsBetween(filters).map((period) => {
    const periodRows = rows.filter((order) => periodKey(new Date(order.createdAt), filters.grouping) === period);
    const successful = periodRows.filter((order) => SUCCESSFUL_STATUSES.has(order.status)).length;
    return { period, total: periodRows.length, successful, rate: periodRows.length === 0 ? 0 : percentage(successful, periodRows.length) };
  });
}
function buildOrderTrends(rows: Array<{ status: TransactionOrderStatus; createdAt: Date | string }>, now: Date): AdminTransactionFinanceDashboard["orderTrends"] {
  const definitions = [
    { range: "30d" as const, days: 30, grouping: "day" as const },
    { range: "90d" as const, days: 90, grouping: "week" as const },
    { range: "180d" as const, days: 180, grouping: "month" as const },
  ];

  return definitions.map(({ range, days, grouping }) => {
    const start = subtractInclusiveRange(now, days);
    start.setUTCHours(0, 0, 0, 0);
    const selected = rows.filter((order) => {
      const createdAt = new Date(order.createdAt);
      return createdAt >= start && createdAt <= now;
    });
    const periods = periodsBetween({ startDate: dateKey(start), endDate: dateKey(now), grouping });
    const points = periods.map((period) => {
      const periodRows = selected.filter((order) => periodKey(new Date(order.createdAt), grouping) === period);
      return {
        period,
        total: periodRows.length,
        successful: periodRows.filter((order) => SUCCESSFUL_STATUSES.has(order.status)).length,
        failed: periodRows.filter((order) => order.status === "failed").length,
      };
    });

    return {
      range,
      total: selected.length,
      successful: selected.filter((order) => SUCCESSFUL_STATUSES.has(order.status)).length,
      failed: selected.filter((order) => order.status === "failed").length,
      points,
    };
  });
}


function aggregateProducts(rows: DashboardOrder[]): AdminTransactionFinanceDashboard["products"]["rows"] {
  const products = new Map<string, AdminTransactionFinanceDashboard["products"]["rows"][number] & { orderIds: Set<string> }>();
  for (const order of rows) {
    for (const item of order.items) {
      const key = `${item.productKey}\u0000${item.currency}`;
      const current = products.get(key) ?? { productKey: item.productKey, name: item.name, unitsSold: 0, orderCount: 0, grossRevenue: 0, currency: item.currency, orderIds: new Set<string>() };
      current.unitsSold += item.quantity;
      current.grossRevenue += item.totalAmount;
      current.orderIds.add(order.id);
      current.orderCount = current.orderIds.size;
      products.set(key, current);
    }
  }
  return Array.from(products.values())
    .map(({ orderIds: _orderIds, ...product }) => ({ ...product, grossRevenue: centsToMajor(product.grossRevenue) }))
    .sort((left, right) => left.productKey.localeCompare(right.productKey) || left.currency.localeCompare(right.currency));
}

function paginate(rows: DashboardOrder[], requestedPage: number) {
  const totalItems = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  return { rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), pagination: { page, pageSize: PAGE_SIZE, totalItems, totalPages } };
}

async function loadProviderPages<T>(
  loader: ((params?: ProviderListParams) => Promise<{ items: T[]; nextCursor?: string | null }>) | undefined,
  baseParams: Omit<ProviderListParams, "pageSize" | "cursor">,
  id: (row: T) => string,
  warnings: Warning[],
  source: string,
  unavailableMessage: string,
): Promise<{ items: T[]; complete: boolean }> {
  if (!loader) {
    warnings.push({ source, message: unavailableMessage });
    return { items: [], complete: false };
  }
  try {
    const rows = new Map<string, T>();
    let cursor: string | undefined;
    let nextCursor: string | null | undefined;
    let pages = 0;
    const maxPages = Math.ceil(MAX_PROVIDER_ROWS / PROVIDER_PAGE_SIZE);
    do {
      const page = await loader({ ...baseParams, pageSize: PROVIDER_PAGE_SIZE, cursor });
      pages += 1;
      for (const row of page.items) {
        if (rows.size >= MAX_PROVIDER_ROWS) break;
        rows.set(id(row), row);
      }
      nextCursor = page.nextCursor;
      if (!nextCursor || rows.size >= MAX_PROVIDER_ROWS || pages >= maxPages) break;
      cursor = nextCursor;
    } while (pages < maxPages);
    const complete = !nextCursor;
    if (!complete) warnings.push({ source: `${source}-page-cap`, message: `${providerSourceLabel(source)} page limit reached; data may be incomplete.` });
    return { items: Array.from(rows.values()), complete };
  } catch {
    warnings.push({ source, message: unavailableMessage });
    return { items: [], complete: false };
  }
}

function providerSourceLabel(source: string) {
  if (source.endsWith("-payments")) return "Provider payment";
  if (source.endsWith("-refunds")) return "Provider refund";
  return "Provider product";
}

async function loadInChunks<T>(ids: string[], loader: (ids: string[]) => Promise<T[]>): Promise<T[]> {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += ENRICHMENT_CHUNK_SIZE) chunks.push(ids.slice(index, index + ENRICHMENT_CHUNK_SIZE));
  return (await Promise.all(chunks.map(loader))).flat();
}

function stripRaw<T>(row: T): Omit<T, "raw"> {
  if (!row || typeof row !== "object") return row as Omit<T, "raw">;
  const { raw: _raw, ...safe } = row as T & { raw?: unknown };
  return safe;
}

function periodsBetween(filters: Pick<NormalizedFilters, "startDate" | "endDate" | "grouping">) {
  const periods: string[] = [];
  const cursor = new Date(`${filters.startDate}T00:00:00.000Z`);
  if (filters.grouping === "week") {
    const weekday = cursor.getUTCDay() || 7;
    cursor.setUTCDate(cursor.getUTCDate() - weekday + 1);
  } else if (filters.grouping === "month") cursor.setUTCDate(1);
  else if (filters.grouping === "year") cursor.setUTCMonth(0, 1);
  const end = new Date(`${filters.endDate}T23:59:59.999Z`);
  while (cursor <= end) {
    periods.push(periodKey(cursor, filters.grouping));
    if (filters.grouping === "day") cursor.setUTCDate(cursor.getUTCDate() + 1);
    else if (filters.grouping === "week") cursor.setUTCDate(cursor.getUTCDate() + 7);
    else if (filters.grouping === "month") cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
    else cursor.setUTCFullYear(cursor.getUTCFullYear() + 1, 0, 1);
  }
  return Array.from(new Set(periods));
}

function periodKey(date: Date, grouping: NormalizedFilters["grouping"]) {
  const normalized = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (grouping === "week") {
    const weekday = normalized.getUTCDay() || 7;
    normalized.setUTCDate(normalized.getUTCDate() - weekday + 1);
  } else if (grouping === "month") normalized.setUTCDate(1);
  else if (grouping === "year") normalized.setUTCMonth(0, 1);
  return dateKey(normalized);
}

function metadataString(metadata: unknown, key: "name" | "description") {
  if (!metadata || typeof metadata !== "object") return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function positiveInteger(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && value && value > 0 ? Math.trunc(value) : fallback;
}

function percentage(numerator: number, denominator: number) {
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function centsToMajor(cents: number) {
  return Number((cents / 100).toFixed(2));
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function nullableIso(value: Date | string | null | undefined) {
  return value ? toIso(value) : null;
}
