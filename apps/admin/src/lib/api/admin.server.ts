import { apiRoutes } from "@platform/contracts/ts";
import type {
  AdminCreditsDashboard,
  AdminJobRunStatus,
  AdminJobRunsList,
  AdminJobsList,
  AdminJobStatus,
  AdminOperationsStats,
  AdminPendingEmailStatus,
  AdminPendingEmailsList,
  AdminSubscriptionFinanceDashboard,
  AdminDashboardStats,
  AdminUserDetail,
  AdminUserStats,
  AdminWebhookEventsList,
  AdminWebhookEventStatus,
  AdminWebhookStats,
  CreditBalance,
  CreditPurchase,
  CreditTransaction,
  CreditsConsumedPoint,
  RevenuePoint,
  SubscriptionEvent,
  SubscriptionFinanceSummary,
  SubscriptionPaymentsList,
  SubscriptionPlanDistributionPoint,
  SubscriptionStats,
  SubscriptionsList,
  TransactionPoint,
} from "@platform/contracts";

import { serverApiRequest } from "./client.server";

export type TimeRange = "daily" | "weekly" | "monthly" | "yearly";

export type AdminWebhookEventsQuery = {
  limit?: number;
  offset?: number;
  provider?: string;
  status?: AdminWebhookEventStatus;
  eventType?: string;
  paymentId?: string;
  text?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type AdminJobsQuery = {
  limit?: number;
  offset?: number;
  name?: string;
  status?: AdminJobStatus;
};

export type AdminJobRunsQuery = {
  limit?: number;
  offset?: number;
  jobName?: string;
  status?: AdminJobRunStatus;
};

export type AdminPendingEmailsQuery = {
  limit?: number;
  offset?: number;
  text?: string;
  status?: AdminPendingEmailStatus;
};

export type LogFileList = {
  files: string[];
  selectedFile: string | null;
};

function adminWebhookQueryString(query: AdminWebhookEventsQuery = {}) {
  const params = new URLSearchParams({
    limit: String(query.limit ?? 100),
    offset: String(query.offset ?? 0),
  });

  if (query.provider) params.set("provider", query.provider);
  if (query.status) params.set("status", query.status);
  if (query.eventType) params.set("eventType", query.eventType);
  if (query.paymentId) params.set("paymentId", query.paymentId);
  if (query.text) params.set("text", query.text);
  if (query.dateFrom) params.set("dateFrom", query.dateFrom);
  if (query.dateTo) params.set("dateTo", query.dateTo);

  return params.toString();
}

function adminOperationsQueryString(query: Record<string, string | number | undefined> = {}) {
  const params = new URLSearchParams({
    limit: String(query.limit ?? 50),
    offset: String(query.offset ?? 0),
  });

  for (const [key, value] of Object.entries(query)) {
    if (key !== "limit" && key !== "offset" && value !== undefined && String(value).length > 0) {
      params.set(key, String(value));
    }
  }

  return params.toString();
}

export async function getAdminDashboardStatsServer(): Promise<AdminDashboardStats> {
  const result = await serverApiRequest<{ success: boolean; data: AdminDashboardStats }>("/admin/dashboard/stats");
  return result.data;
}

export async function getAdminUserStatsServer(): Promise<AdminUserStats> {
  const result = await serverApiRequest<{ success: boolean; data: AdminUserStats }>("/admin/users/stats");
  return result.data;
}

export async function getAdminUserServer(userId: string) {
  return serverApiRequest<{ success: boolean; data?: AdminUserDetail; error?: string }>(`/admin/users/${userId}`);
}

export async function getAdminUserCreditBalanceServer(userId: string): Promise<CreditBalance> {
  const result = await serverApiRequest<{ success: boolean; data: CreditBalance }>(`/admin/users/${userId}/credits/balance`);
  return result.data;
}

export async function getAdminUserCreditHistoryServer(userId: string): Promise<CreditTransaction[]> {
  const result = await serverApiRequest<{ success: boolean; data: CreditTransaction[] }>(`/admin/users/${userId}/credits/history`);
  return result.data;
}

export async function getAdminUserCreditPurchasesServer(userId: string): Promise<CreditPurchase[]> {
  const result = await serverApiRequest<{ success: boolean; data: CreditPurchase[] }>(`/admin/users/${userId}/credits/purchases`);
  return result.data;
}

export async function getAdminLogFilesServer(stream: "app" | "audit" = "app"): Promise<LogFileList> {
  const result = await serverApiRequest<{ success: boolean; data: LogFileList }>(`/admin/logs/files?stream=${stream}`);
  return result.data;
}

export async function getAdminWebhookEventsServer(query: AdminWebhookEventsQuery = {}): Promise<AdminWebhookEventsList> {
  const result = await serverApiRequest<{ success: boolean; data: AdminWebhookEventsList }>(
    `/admin/webhooks?${adminWebhookQueryString(query)}`,
  );
  return result.data;
}

export async function getAdminWebhookStatsServer(): Promise<AdminWebhookStats> {
  const result = await serverApiRequest<{ success: boolean; data: AdminWebhookStats }>("/admin/webhooks/stats");
  return result.data;
}

export async function getAdminOperationsStatsServer(): Promise<AdminOperationsStats> {
  const result = await serverApiRequest<{ success: boolean; data: AdminOperationsStats }>(apiRoutes.admin.operationsStats);
  return result.data;
}

export async function getAdminJobsServer(query: AdminJobsQuery = {}): Promise<AdminJobsList> {
  const result = await serverApiRequest<{ success: boolean; data: AdminJobsList }>(
    `${apiRoutes.admin.jobs()}?${adminOperationsQueryString(query)}`,
  );
  return result.data;
}

export async function getAdminJobRunsServer(query: AdminJobRunsQuery = {}): Promise<AdminJobRunsList> {
  const result = await serverApiRequest<{ success: boolean; data: AdminJobRunsList }>(
    `${apiRoutes.admin.jobRuns()}?${adminOperationsQueryString(query)}`,
  );
  return result.data;
}

export async function getAdminPendingEmailsServer(query: AdminPendingEmailsQuery = {}): Promise<AdminPendingEmailsList> {
  const result = await serverApiRequest<{ success: boolean; data: AdminPendingEmailsList }>(
    `${apiRoutes.admin.pendingEmails()}?${adminOperationsQueryString(query)}`,
  );
  return result.data;
}

export async function getAdminRevenueDataServer(timeRange: TimeRange): Promise<RevenuePoint[]> {
  const result = await serverApiRequest<{ success: boolean; data: RevenuePoint[] }>(`/admin/billing/revenue?timeRange=${timeRange}`);
  return result.data;
}

export async function getAdminTransactionDataServer(timeRange: TimeRange): Promise<TransactionPoint[]> {
  const result = await serverApiRequest<{ success: boolean; data: TransactionPoint[] }>(apiRoutes.admin.billingTransactionsChart(timeRange));
  return result.data;
}

export async function getAdminCreditsConsumedDataServer(timeRange: TimeRange): Promise<CreditsConsumedPoint[]> {
  const result = await serverApiRequest<{ success: boolean; data: CreditsConsumedPoint[] }>(apiRoutes.admin.billingCreditsConsumedChart(timeRange));
  return result.data;
}

export type AdminCreditsDashboardQuery = {
  creditsPurchasesPage?: number;
  creditsPurchasesSearch?: string;
  creditsRefundsPage?: number;
  creditsRefundsSearch?: string;
  range?: "7d" | "30d" | "90d" | "12m" | "ytd";
};

export type AdminSubscriptionFinanceDashboardQuery = {
  range?: "7d" | "30d" | "90d" | "12m" | "ytd";
  startDate?: string;
  endDate?: string;
  grouping?: "day" | "week" | "month" | "year";
  currency?: string;
  planKey?: string;
  status?: "active" | "trialing" | "past_due" | "canceled" | "expired" | "paused";
  search?: string;
  subscriptionsPage?: number;
  subscriptionsSearch?: string;
};

export async function getAdminCreditsDashboardServer(query: AdminCreditsDashboardQuery = {}): Promise<AdminCreditsDashboard> {
  const result = await serverApiRequest<{ success: boolean; data: AdminCreditsDashboard }>(apiRoutes.admin.billingCreditsDashboard(query));
  return result.data;
}

export async function getAdminBillingSubscriptionsServer(limit = 20, offset = 0, searchEmail?: string): Promise<SubscriptionsList> {
  const result = await serverApiRequest<{ success: boolean; data: SubscriptionsList }>(apiRoutes.admin.billingSubscriptions(limit, offset, searchEmail));
  return result.data;
}

export async function getAdminBillingSubscriptionPaymentsServer(limit = 20, offset = 0, searchEmail?: string): Promise<SubscriptionPaymentsList> {
  const result = await serverApiRequest<{ success: boolean; data: SubscriptionPaymentsList }>(apiRoutes.admin.billingSubscriptionPayments(limit, offset, searchEmail));
  return result.data;
}

export async function getAdminBillingSubscriptionStatsServer(): Promise<SubscriptionStats> {
  const result = await serverApiRequest<{ success: boolean; data: SubscriptionStats }>(apiRoutes.admin.billingSubscriptionStats);
  return result.data;
}

export async function getAdminBillingSubscriptionFinanceSummaryServer(): Promise<SubscriptionFinanceSummary> {
  const result = await serverApiRequest<{ success: boolean; data: SubscriptionFinanceSummary }>(apiRoutes.admin.billingSubscriptionFinanceSummary);
  return result.data;
}

export async function getAdminBillingSubscriptionFinanceDashboardServer(query: AdminSubscriptionFinanceDashboardQuery = {}): Promise<AdminSubscriptionFinanceDashboard> {
  const result = await serverApiRequest<{ success: boolean; data: AdminSubscriptionFinanceDashboard }>(apiRoutes.admin.billingSubscriptionFinanceDashboard(query));
  return result.data;
}

export async function getAdminBillingSubscriptionPlanDistributionServer(): Promise<SubscriptionPlanDistributionPoint[]> {
  const result = await serverApiRequest<{ success: boolean; data: SubscriptionPlanDistributionPoint[] }>(apiRoutes.admin.billingSubscriptionPlanDistribution);
  return result.data;
}

export async function getAdminBillingSubscriptionEventsServer(limit = 50): Promise<SubscriptionEvent[]> {
  const result = await serverApiRequest<{ success: boolean; data: SubscriptionEvent[] }>(apiRoutes.admin.billingSubscriptionEvents(limit));
  return result.data;
}
