import {
  adminTransactionFinanceDashboardQuerySchema,
  transactionProducts,
  type AdminTransactionFinanceDashboard,
  type AdminTransactionFinanceDashboardQuery,
} from "@platform/contracts";

export type TransactionOrderStatus = NonNullable<AdminTransactionFinanceDashboard["filters"]["status"]>;
export type TransactionDashboardSearchParams = Record<string, string | string[] | undefined>;
export type TransactionFinanceDashboardSection = "overview" | "orders" | "refunds" | "products";
export type TransactionAdminBillingSection = TransactionFinanceDashboardSection | "discounts" | "vouchers";

const orderFilterKeys = ["range", "startDate", "endDate", "status", "search"] as const;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function formatMajorMoney(value: number, currency: string, locale?: string) {
  const safeCurrency = currency?.trim() || "EUR";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: safeCurrency }).format(value);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return `${value.toFixed(2)} ${safeCurrency}`;
  }
}

export function formatMinorMoney(valueInCents: number, currency: string, locale?: string) {
  return formatMajorMoney(valueInCents / 100, currency, locale);
}

export function formatProviderMoney(value: { amount: number; currency: string }, locale?: string) {
  return formatMinorMoney(value.amount, value.currency, locale);
}

export function transactionStatusVariant(status: TransactionOrderStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "paid") return "default";
  if (status === "failed") return "destructive";
  if (status === "cancelled") return "outline";
  return "secondary";
}

export function buildRevenueChartData(points: AdminTransactionFinanceDashboard["revenue"]) {
  const currencies = [...new Set(points.map((point) => point.currency))].sort();
  const periods = new Map<string, Record<string, string | number>>();

  for (const point of points) {
    const row = periods.get(point.period) ?? { period: point.period };
    row[point.currency] = point.amount;
    periods.set(point.period, row);
  }

  return {
    currencies,
    rows: [...periods.values()].sort((left, right) => String(left.period).localeCompare(String(right.period))),
  };
}

export function buildRevenueAccessibleRows(points: AdminTransactionFinanceDashboard["revenue"], locale?: string) {
  const { currencies, rows } = buildRevenueChartData(points);
  return rows.map((row) => ({
    period: String(row.period),
    values: currencies.flatMap((currency) => typeof row[currency] === "number" ? [`${currency}: ${formatMajorMoney(row[currency], currency, locale)}`] : []),
  }));
}

export function buildAttemptsAccessibleRows(points: AdminTransactionFinanceDashboard["attempts"]) {
  return points.map(({ period, success, failed, pending, cancelled }) => ({ period, success, failed, pending, cancelled }));
}

export function buildSuccessAccessibleRows(points: AdminTransactionFinanceDashboard["successRate"]) {
  return points.map(({ period, total, successful, rate }) => ({ period, total, successful, rate: `${rate.toFixed(2)}%` }));
}

export function buildTransactionDashboardHref(
  pathname: string,
  current: URLSearchParams,
  updates: Record<string, string | number | undefined | null>,
) {
  const params = new URLSearchParams(current.toString());
  const section = transactionAdminBillingSection(params.get("section") ?? undefined, params.get("tab") ?? undefined);
  params.delete("tab");
  if (section === "overview") params.delete("section");
  else params.set("section", section);
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null || value === "") params.delete(key);
    else params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function transactionAdminBillingSection(
  section: string | undefined,
  legacyTab: string | undefined,
): TransactionAdminBillingSection {
  if (section !== undefined) return isTransactionAdminBillingSection(section) ? section : "overview";
  return legacyTab && isTransactionAdminBillingSection(legacyTab) ? legacyTab : "overview";
}

export function transactionSectionUsesDashboard(section: string): section is TransactionFinanceDashboardSection {
  return section === "overview" || section === "orders" || section === "refunds" || section === "products";
}

export function buildTransactionSectionHref(
  pathname: string,
  current: URLSearchParams,
  requestedSection: string,
) {
  const section = transactionAdminBillingSection(requestedSection, undefined);
  if (!transactionSectionUsesDashboard(section)) return `${pathname}?section=${section}`;

  const currentSection = transactionAdminBillingSection(current.get("section") ?? undefined, current.get("tab") ?? undefined);
  const params = new URLSearchParams();
  if (section !== "overview") params.set("section", section);
  if (section === "orders" && currentSection === "orders") {
    for (const key of orderFilterKeys) {
      const value = current.get(key);
      if (value !== null) params.set(key, value);
    }
    params.set("page", "1");
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function isTransactionAdminBillingSection(value: string): value is TransactionAdminBillingSection {
  return transactionSectionUsesDashboard(value) || value === "discounts" || value === "vouchers";
}

export function deriveTransactionOrderFilterControls(filters: AdminTransactionFinanceDashboard["filters"]) {
  return {
    range: filters.range,
    startDate: filters.startDate,
    endDate: filters.endDate,
    status: filters.status ?? "all",
    search: filters.search ?? "",
  };
}

export function warningTranslationKey(source: string) {
  if (source.endsWith("-page-cap")) return "warnings.providerPageCap" as const;
  if (source === "payment-provider-payments") return "warnings.providerPayments" as const;
  if (source === "payment-provider-refunds") return "warnings.providerRefunds" as const;
  if (source === "payment-provider-products") return "warnings.providerProducts" as const;
  if (source === "local-analytics") return "warnings.analyticsTruncation" as const;
  if (source === "local-partial-refunds") return "warnings.localPartialRefund" as const;
  return "warnings.generic" as const;
}

export function providerRefundStatusTranslationKey(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "success" || normalized === "succeeded" || normalized === "completed") return "providerStatus.successful" as const;
  if (normalized === "pending" || normalized === "processing") return "providerStatus.pending" as const;
  if (normalized === "failed") return "providerStatus.failed" as const;
  if (normalized === "cancelled" || normalized === "canceled") return "providerStatus.cancelled" as const;
  return "providerStatus.unknown" as const;
}

export function parseTransactionDashboardQuery(params: TransactionDashboardSearchParams): Partial<AdminTransactionFinanceDashboardQuery> {
  const range = first(params.range);
  const grouping = first(params.grouping);
  const status = first(params.status);
  const rawPage = first(params.page);
  const page = rawPage === undefined ? 1 : Number(rawPage);
  const currency = first(params.currency)?.trim().toUpperCase();
  const productKey = first(params.productKey)?.trim();
  const search = first(params.search)?.trim();
  const candidate: Record<string, unknown> = {
    range: range === "7d" || range === "30d" || range === "90d" || range === "12m" || range === "custom" ? range : "30d",
    page: Number.isInteger(page) && page > 0 && page <= 10_000 ? page : 1,
  };

  if (grouping === "day" || grouping === "week" || grouping === "month" || grouping === "year") candidate.grouping = grouping;
  if (currency && /^[A-Z]{3}$/.test(currency)) candidate.currency = currency;
  if (status === "pending_payment" || status === "paid" || status === "failed" || status === "cancelled" || status === "refunded" || status === "partially_refunded") candidate.status = status;
  if (productKey && transactionProducts.some((product) => product.key === productKey)) candidate.productKey = productKey;
  if (search && search.length <= 255) candidate.search = search;
  if (candidate.range === "custom") {
    candidate.startDate = first(params.startDate)?.trim();
    candidate.endDate = first(params.endDate)?.trim();
  }

  const parsed = adminTransactionFinanceDashboardQuerySchema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  delete candidate.startDate;
  delete candidate.endDate;
  candidate.range = "30d";
  return adminTransactionFinanceDashboardQuerySchema.parse(candidate);
}

export function parseTransactionDashboardQueryForSection(
  section: TransactionFinanceDashboardSection,
  params: TransactionDashboardSearchParams,
): Partial<AdminTransactionFinanceDashboardQuery> {
  const scopedParams: TransactionDashboardSearchParams = { page: params.page };
  if (section === "orders") {
    for (const key of orderFilterKeys) scopedParams[key] = params[key];
  }
  return parseTransactionDashboardQuery(scopedParams);
}
