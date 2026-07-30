import { apiRequest } from "./client";

import type { AdminCreateDiscountInput, AdminUpdateDiscountInput, DiscountStatus } from "@/types/discounts";
import type {
  AdminDashboardStats,
  AdminCreditRefundResponseData,
  AdminCreditsDashboard,
  AdminSubscriptionFinanceDashboard,
  AdminSubscriptionRefundResponseData,
  AdminSearchUser,
  AdminUserDetail,
  AdminUsersList,
  AdminUserStats,
  AdminWebhookEvent,
  AdminWebhookEventsList,
  AdminWebhookEventStatus,
  AdminWebhookStats,
  BillingStats,
  CreditBalance,
  CreditPurchase,
  CreditTransaction,
  CreditsConsumedPoint,
  NotificationSendHistoryItem,
  NotificationSendResult,
  PurchasesList,
  RevenuePoint,
  SubscriptionEvent,
  SubscriptionFinanceSummary,
  SubscriptionPlanDistributionPoint,
  SubscriptionPaymentsList,
  SubscriptionStats,
  SubscriptionsList,
  TransactionPoint,
  TransactionsList,
  VoucherAssignmentScope,
  VoucherStatus,
} from "@platform/contracts";
import { apiRoutes } from "@platform/contracts/ts";

export async function verifyAdminSecretApi(secret: string) {
  return apiRequest<{ success: boolean; error?: string }>("/admin/verify-admin-secret", {
    method: "POST",
    body: JSON.stringify({ secret }),
  });
}

export async function getAdminStatusApi() {
  return apiRequest<{
    success: boolean;
    data: { message: string; totpRequired: boolean; twoFactorEnabled: boolean; canEnrollTotp: boolean };
  }>("/admin/status");
}

export async function getAdminDashboardStatsApi() {
  const result = await apiRequest<{ success: boolean; data: AdminDashboardStats }>("/admin/dashboard/stats");
  return result.data;
}

export async function getSystemHealthApi() {
  const result = await apiRequest<{ success: boolean; data: { status: string } }>("/health");
  return result.data;
}

export async function getAdminUsersApi(limit = 20, offset = 0, search?: string, role?: "user" | "admin") {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  if (search?.trim()) {
    params.set("search", search.trim());
  }

  if (role) {
    params.set("role", role);
  }

  const result = await apiRequest<{ success: boolean; data: AdminUsersList }>(`/admin/users?${params.toString()}`);
  return result.data;
}

export async function setAdminUserRoleApi(
  userId: string,
  role: "user" | "admin",
  options: { reason?: string; confirmed?: boolean; secret: string },
) {
  return apiRequest<{ user?: unknown; error?: { message?: string } | string }>("/admin/users/set-role", {
    method: "POST",
    body: JSON.stringify({ userId, role, ...options }),
  });
}

export async function unbanAdminUserApi(userId: string, secret: string) {
  return apiRequest<{ user?: unknown; error?: { message?: string } | string }>("/admin/users/unban", {
    method: "POST",
    body: JSON.stringify({ userId, secret }),
  });
}

export async function banAdminUserApi(payload: { userId: string; secret: string; banReason?: string; banExpiresIn?: number }) {
  return apiRequest<{ user?: unknown; error?: { message?: string } | string }>("/admin/users/ban", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function impersonateAdminUserApi(userId: string, secret: string) {
  return apiRequest<{ session?: unknown; user?: unknown; error?: { message?: string } | string }>(
    "/admin/users/impersonate",
    {
      method: "POST",
      body: JSON.stringify({ userId, secret }),
    },
  );
}

export async function stopAdminImpersonationApi() {
  return apiRequest<{ session?: unknown; user?: unknown; error?: { message?: string } | string }>(
    "/auth/admin/stop-impersonating",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function revokeAdminUserSessionsApi(userId: string, secret: string) {
  return apiRequest<{ success?: boolean; error?: { message?: string } | string }>(
    "/admin/users/revoke-sessions",
    {
      method: "POST",
      body: JSON.stringify({ userId, secret }),
    },
  );
}

export async function setAdminUserPasswordApi(userId: string, newPassword: string, secret: string) {
  return apiRequest<{ status?: boolean; error?: { message?: string } | string }>("/admin/users/set-password", {
    method: "POST",
    body: JSON.stringify({ userId, newPassword, secret }),
  });
}

export async function getAdminUserStatsApi() {
  const result = await apiRequest<{ success: boolean; data: AdminUserStats }>("/admin/users/stats");
  return result.data;
}

export async function getAdminUserApi(userId: string) {
  return apiRequest<{ success: boolean; data?: AdminUserDetail; error?: string }>(`/admin/users/${userId}`);
}

export async function getAdminUserCreditBalanceApi(userId: string) {
  const result = await apiRequest<{ success: boolean; data: CreditBalance }>(`/admin/users/${userId}/credits/balance`);
  return result.data;
}

export async function getAdminUserCreditHistoryApi(userId: string) {
  const result = await apiRequest<{ success: boolean; data: CreditTransaction[] }>(`/admin/users/${userId}/credits/history`);
  return result.data;
}

export async function getAdminUserCreditPurchasesApi(userId: string) {
  const result = await apiRequest<{ success: boolean; data: CreditPurchase[] }>(`/admin/users/${userId}/credits/purchases`);
  return result.data;
}

export async function getAdminBillingStatsApi() {
  const result = await apiRequest<{ success: boolean; data: BillingStats }>("/admin/billing/stats");
  return result.data;
}

export async function getAdminRevenueDataApi(timeRange: "daily" | "weekly" | "monthly" | "yearly") {
  const result = await apiRequest<{ success: boolean; data: RevenuePoint[] }>(`/admin/billing/revenue?timeRange=${timeRange}`);
  return result.data;
}

export async function getAdminAllTransactionsApi(limit = 20, offset = 0, searchEmail?: string) {
  const search = searchEmail ? `&searchEmail=${encodeURIComponent(searchEmail)}` : "";
  const result = await apiRequest<{ success: boolean; data: TransactionsList }>(
    `/admin/billing/transactions?limit=${limit}&offset=${offset}${search}`,
  );
  return result.data;
}

export async function getAdminAllPurchasesApi(limit = 20, offset = 0, searchEmail?: string) {
  const search = searchEmail ? `&searchEmail=${encodeURIComponent(searchEmail)}` : "";
  const result = await apiRequest<{ success: boolean; data: PurchasesList }>(
    `/admin/billing/purchases?limit=${limit}&offset=${offset}${search}`,
  );
  return result.data;
}

export async function getAdminAllSubscriptionsApi(limit = 20, offset = 0, searchEmail?: string) {
  const search = searchEmail ? `&searchEmail=${encodeURIComponent(searchEmail)}` : "";
  const result = await apiRequest<{ success: boolean; data: SubscriptionsList }>(
    `/admin/billing/subscriptions?limit=${limit}&offset=${offset}${search}`,
  );
  return result.data;
}

export async function getAdminSubscriptionStatsApi() {
  const result = await apiRequest<{ success: boolean; data: SubscriptionStats }>("/admin/billing/subscription-stats");
  return result.data;
}

export async function getAdminTransactionDataApi(timeRange: "daily" | "weekly" | "monthly" | "yearly") {
  const result = await apiRequest<{ success: boolean; data: TransactionPoint[] }>(
    `/admin/billing/transactions-chart?timeRange=${timeRange}`,
  );
  return result.data;
}

export async function getAdminCreditsConsumedDataApi(timeRange: "daily" | "weekly" | "monthly" | "yearly") {
  const result = await apiRequest<{ success: boolean; data: CreditsConsumedPoint[] }>(
    `/admin/billing/credits-consumed-chart?timeRange=${timeRange}`,
  );
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

export async function getAdminCreditsDashboardApi(query: AdminCreditsDashboardQuery = {}) {
  const result = await apiRequest<{ success: boolean; data: AdminCreditsDashboard }>(
    apiRoutes.admin.billingCreditsDashboard(query),
  );
  return result.data;
}

export async function createAdminCreditRefundApi(payload: { paymentId: string; reason?: string; secret: string }) {
  const result = await apiRequest<{ success: boolean; data: AdminCreditRefundResponseData; error?: string }>(
    apiRoutes.admin.billingCreditRefunds,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return result.data;
}

export async function getAdminBillingSubscriptionsApi(limit = 20, offset = 0, searchEmail?: string) {
  const result = await apiRequest<{ success: boolean; data: SubscriptionsList }>(
    apiRoutes.admin.billingSubscriptions(limit, offset, searchEmail),
  );
  return result.data;
}

export async function getAdminBillingSubscriptionPaymentsApi(limit = 20, offset = 0, searchEmail?: string) {
  const result = await apiRequest<{ success: boolean; data: SubscriptionPaymentsList }>(
    apiRoutes.admin.billingSubscriptionPayments(limit, offset, searchEmail),
  );
  return result.data;
}

export async function createAdminSubscriptionRefundApi(payload: { paymentId: string; reason?: string; secret: string }) {
  const result = await apiRequest<{ success: boolean; data: AdminSubscriptionRefundResponseData; error?: string }>(
    apiRoutes.admin.billingSubscriptionRefunds,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return result.data;
}

export async function getAdminBillingSubscriptionStatsApi() {
  const result = await apiRequest<{ success: boolean; data: SubscriptionStats }>(
    apiRoutes.admin.billingSubscriptionStats,
  );
  return result.data;
}

export async function getAdminBillingSubscriptionFinanceSummaryApi() {
  const result = await apiRequest<{ success: boolean; data: SubscriptionFinanceSummary }>(
    apiRoutes.admin.billingSubscriptionFinanceSummary,
  );
  return result.data;
}

export async function getAdminBillingSubscriptionFinanceDashboardApi(query: AdminSubscriptionFinanceDashboardQuery = {}) {
  const result = await apiRequest<{ success: boolean; data: AdminSubscriptionFinanceDashboard }>(
    apiRoutes.admin.billingSubscriptionFinanceDashboard(query),
  );
  return result.data;
}

export async function getAdminBillingSubscriptionPlanDistributionApi() {
  const result = await apiRequest<{ success: boolean; data: SubscriptionPlanDistributionPoint[] }>(
    apiRoutes.admin.billingSubscriptionPlanDistribution,
  );
  return result.data;
}

export async function getAdminBillingSubscriptionEventsApi(limit = 50) {
  const result = await apiRequest<{ success: boolean; data: SubscriptionEvent[] }>(
    apiRoutes.admin.billingSubscriptionEvents(limit),
  );
  return result.data;
}

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

export async function getAdminWebhookEventsApi(query: AdminWebhookEventsQuery = {}) {
  const result = await apiRequest<{ success: boolean; data: AdminWebhookEventsList }>(
    `/admin/webhooks?${adminWebhookQueryString(query)}`,
  );
  return result.data;
}

export async function getAdminWebhookStatsApi() {
  const result = await apiRequest<{ success: boolean; data: AdminWebhookStats }>("/admin/webhooks/stats");
  return result.data;
}

export async function getAdminWebhookEventApi(eventId: string) {
  const result = await apiRequest<{ success: boolean; data: AdminWebhookEvent }>(`/admin/webhooks/${eventId}`);
  return result.data;
}

export async function getDiscountsApi(limit = 20, offset = 0, search?: string, status?: DiscountStatus) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (search) params.set("search", search);
  if (status) params.set("status", status);

  const result = await apiRequest<{ success: boolean; data: unknown }>(`/admin/discounts?${params.toString()}`);
  return result.data;
}

export async function getDiscountByIdApi(discountId: string) {
  return apiRequest<{ success: boolean; discount?: unknown; error?: string }>(`/admin/discounts/${discountId}`);
}

export async function generateDiscountCodeApi(overridePrefix?: string) {
  return apiRequest<{ success: boolean; data?: { code: string }; error?: string }>("/admin/discounts/generate-code", {
    method: "POST",
    body: JSON.stringify({ overridePrefix }),
  });
}

export async function validateDiscountCodeApi(code: string, excludeId?: string) {
  const result = await apiRequest<{ success: boolean; data: { valid: boolean; error?: string } }>(
    "/admin/discounts/validate-code",
    {
      method: "POST",
      body: JSON.stringify({ code, excludeId }),
    },
  );
  return result.data;
}

export async function createDiscountApi(payload: AdminCreateDiscountInput) {
  return apiRequest<{ success: boolean; discount?: unknown; error?: string }>("/admin/discounts", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      startDate: payload.startDate.toISOString(),
      endDate: payload.endDate.toISOString(),
    }),
  });
}

export async function updateDiscountApi(payload: AdminUpdateDiscountInput) {
  return apiRequest<{ success: boolean; discount?: unknown; error?: string }>(`/admin/discounts/${payload.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...payload,
      startDate: payload.startDate?.toISOString(),
      endDate: payload.endDate?.toISOString(),
    }),
  });
}

export async function deleteDiscountApi(id: string, secret: string) {
  return apiRequest<{ success: boolean; error?: string }>(`/admin/discounts/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ secret }),
  });
}

export async function getVouchersApi(limit = 20, offset = 0, search?: string, status?: VoucherStatus) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (search) params.set("search", search);
  if (status) params.set("status", status);

  const result = await apiRequest<{ success: boolean; data: unknown }>(`/admin/vouchers?${params.toString()}`);
  return result.data;
}

export async function getVoucherByIdApi(voucherId: string) {
  return apiRequest<{ success: boolean; voucher?: unknown; error?: string }>(`/admin/vouchers/${voucherId}`);
}

export async function createVoucherApi(payload: {
  code: string;
  creditAmount: number;
  assignmentScope: VoucherAssignmentScope;
  maxRedemptions?: number;
  userIds: string[];
  expiresAt?: Date | null;
  secret: string;
}) {
  return apiRequest<{ success: boolean; voucher?: unknown; error?: string }>("/admin/vouchers", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      expiresAt: payload.expiresAt?.toISOString(),
    }),
  });
}

export async function updateVoucherApi(payload: {
  id: string;
  code?: string;
  creditAmount?: number;
  assignmentScope?: VoucherAssignmentScope;
  status?: VoucherStatus;
  maxRedemptions?: number;
  userIds?: string[];
  expiresAt?: Date | null;
  secret: string;
}) {
  return apiRequest<{ success: boolean; voucher?: unknown; error?: string }>(`/admin/vouchers/${payload.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...payload,
      expiresAt: payload.expiresAt === null ? null : payload.expiresAt?.toISOString(),
    }),
  });
}

export async function searchUsersForVoucherApi(query: string, limit = 20) {
  const result = await apiRequest<{ success: boolean; data: AdminSearchUser[] }>(
    `/admin/vouchers/search-users?query=${encodeURIComponent(query)}&limit=${limit}`,
  );
  return result.data;
}

export async function getAdminLogFilesApi(stream: "app" | "audit" = "app") {
  const result = await apiRequest<{ success: boolean; data: unknown }>(`/admin/logs/files?stream=${stream}`);
  return result.data;
}

export async function getAdminLogEntriesApi(payload: { stream?: "app" | "audit"; file?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (payload.stream) params.set("stream", payload.stream);
  if (payload.file) params.set("file", payload.file);
  if (payload.limit) params.set("limit", String(payload.limit));
  const query = params.toString();
  const result = await apiRequest<{ success: boolean; data: unknown }>(`/admin/logs/entries${query ? `?${query}` : ""}`);
  return result.data;
}

export async function getAllNotificationsApi(limit = 50) {
  const result = await apiRequest<{ success: boolean; data: unknown }>(`/admin/notifications?limit=${limit}`);
  return result.data;
}

export async function getNotificationSendHistoryApi(limit = 50) {
  const result = await apiRequest<{ success: boolean; data: NotificationSendHistoryItem[] }>(apiRoutes.admin.notificationSends(limit));
  return result.data;
}

export async function searchUsersForNotificationApi(query: string, limit = 20) {
  const result = await apiRequest<{ success: boolean; data: Array<{ id: string; name: string | null; email: string }> }>(
    `/admin/notifications/search-users?query=${encodeURIComponent(query)}&limit=${limit}`,
  );
  return result.data;
}

export async function sendNotificationToAllUsersApi(payload: {
  title: string;
  message: string;
  type?: "info" | "warning" | "success" | "error";
  category?: string;
  data?: Record<string, unknown>;
  showAsBanner?: boolean;
  bannerExpiresAt?: Date;
  secret: string;
}) {
  return apiRequest<{ success: boolean; data: NotificationSendResult }>("/admin/notifications/send-all", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      bannerExpiresAt: payload.bannerExpiresAt?.toISOString(),
    }),
  });
}

export async function sendNotificationToUsersApi(payload: {
  userIds: string[];
  title: string;
  message: string;
  type?: "info" | "warning" | "success" | "error";
  category?: string;
  data?: Record<string, unknown>;
  showAsBanner?: boolean;
  bannerExpiresAt?: Date;
  secret: string;
}) {
  return apiRequest<{ success: boolean; data: NotificationSendResult }>("/admin/notifications/send-users", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      bannerExpiresAt: payload.bannerExpiresAt?.toISOString(),
    }),
  });
}
