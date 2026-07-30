import type { SupportedLocale } from "../../wire/common/query";
import type { VoucherStatus } from "../../wire/vouchers/common";
import type { z } from "zod";

import { discountStatusSchema } from "../../wire/discounts/common";

type DiscountStatus = z.infer<typeof discountStatusSchema>;

type AdminCreditsDashboardQuery = {
  creditsPurchasesPage?: number;
  creditsPurchasesSearch?: string;
  creditsRefundsPage?: number;
  creditsRefundsSearch?: string;
  range?: "7d" | "30d" | "90d" | "12m" | "ytd";
};

type AdminSubscriptionFinanceDashboardQuery = {
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

type AdminJobsQuery = {
  limit?: number;
  offset?: number;
  name?: string;
  status?: "idle" | "running" | "disabled";
};

type AdminJobRunsQuery = {
  limit?: number;
  offset?: number;
  jobName?: string;
  status?: "success" | "failed";
};

type AdminPendingEmailsQuery = {
  limit?: number;
  offset?: number;
  text?: string;
  status?: "pending" | "sending" | "sent" | "failed";
};

function withQuery(path: string, params: Record<string, string | number | boolean | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

export const apiRoutes = {
  health: "/health",
  countries: (lang: SupportedLocale) => withQuery("/countries", { lang }),
  auth: {
    stopImpersonating: "/auth/admin/stop-impersonating",
  },
  payments: {
    checkout: "/payments/checkout",
  },
  me: {
    session: "/me/session",
    applicationConfig: "/me/application-config",
    creditBalance: "/me/credits/balance",
    creditHistory: (limit = 50) => withQuery("/me/credits/history", { limit }),
    creditPurchases: (limit = 50) => withQuery("/me/credits/purchases", { limit }),
    invoice: "/me/credits/invoice",
    subscription: "/me/subscription",
    subscriptionPayments: (limit = 50) => withQuery("/me/subscription/payments", { limit }),
    subscriptionInvoice: "/me/subscription/invoice",
    consumeCredits: "/me/credits/consume",
    redeemVoucher: "/me/vouchers/redeem",
    notifications: (limit = 20) => withQuery("/me/notifications", { limit }),
    unreadNotificationsCount: "/me/notifications/unread-count",
    markNotificationRead: (notificationId: string) => `/me/notifications/${notificationId}/read`,
    markAllNotificationsRead: "/me/notifications/read-all",
    deleteNotification: (notificationId: string) => `/me/notifications/${notificationId}`,
    apiKeys: "/me/api-keys",
    apiKey: (keyId: string) => `/me/api-keys/${keyId}`,
  },
  admin: {
    session: "/admin/session",
    verifyAdminSecret: "/admin/verify-admin-secret",
    dashboardStats: "/admin/dashboard/stats",
    users: (limit = 20, offset = 0) => withQuery("/admin/users", { limit, offset }),
    usersStats: "/admin/users/stats",
    user: (userId: string) => `/admin/users/${userId}`,
    userCreditBalance: (userId: string) => `/admin/users/${userId}/credits/balance`,
    userCreditHistory: (userId: string, limit = 50) => withQuery(`/admin/users/${userId}/credits/history`, { limit }),
    userCreditPurchases: (userId: string, limit = 50) => withQuery(`/admin/users/${userId}/credits/purchases`, { limit }),
    setUserRole: "/admin/users/set-role",
    unbanUser: "/admin/users/unban",
    banUser: "/admin/users/ban",
    impersonateUser: "/admin/users/impersonate",
    revokeUserSessions: "/admin/users/revoke-sessions",
    setUserPassword: "/admin/users/set-password",
    billingStats: "/admin/billing/stats",
    billingRevenue: (timeRange: "daily" | "weekly" | "monthly" | "yearly") =>
      withQuery("/admin/billing/revenue", { timeRange }),
    billingTransactions: (limit = 20, offset = 0, searchEmail?: string) =>
      withQuery("/admin/billing/transactions", { limit, offset, searchEmail }),
    billingPurchases: (limit = 20, offset = 0, searchEmail?: string) =>
      withQuery("/admin/billing/purchases", { limit, offset, searchEmail }),
    billingTransactionsChart: (timeRange: "daily" | "weekly" | "monthly" | "yearly") =>
      withQuery("/admin/billing/transactions-chart", { timeRange }),
    billingCreditsConsumedChart: (timeRange: "daily" | "weekly" | "monthly" | "yearly") =>
      withQuery("/admin/billing/credits-consumed-chart", { timeRange }),
    billingCreditsDashboard: (query: AdminCreditsDashboardQuery = {}) =>
      withQuery("/admin/billing/credits-dashboard", query),
    billingCreditRefunds: "/admin/billing/credit-refunds",
    billingSubscriptionRefunds: "/admin/billing/subscription-refunds",
    billingSubscriptions: (limit = 20, offset = 0, searchEmail?: string) =>
      withQuery("/admin/billing/subscriptions", { limit, offset, searchEmail }),
    billingSubscriptionPayments: (limit = 20, offset = 0, searchEmail?: string) =>
      withQuery("/admin/billing/subscription-payments", { limit, offset, searchEmail }),
    billingSubscriptionStats: "/admin/billing/subscription-stats",
    billingSubscriptionFinanceSummary: "/admin/billing/subscription-finance-summary",
    billingSubscriptionFinanceDashboard: (query: AdminSubscriptionFinanceDashboardQuery = {}) =>
      withQuery("/admin/billing/subscription-finance-dashboard", query),
    billingSubscriptionPlanDistribution: "/admin/billing/subscription-plan-distribution",
    billingSubscriptionEvents: (limit = 50) => withQuery("/admin/billing/subscription-events", { limit }),
    discounts: (limit = 20, offset = 0, search?: string, status?: DiscountStatus) =>
      withQuery("/admin/discounts", { limit, offset, search, status }),
    discount: (discountId: string) => `/admin/discounts/${discountId}`,
    generateDiscountCode: "/admin/discounts/generate-code",
    validateDiscountCode: "/admin/discounts/validate-code",
    vouchers: (limit = 20, offset = 0, search?: string, status?: VoucherStatus) =>
      withQuery("/admin/vouchers", { limit, offset, search, status }),
    voucher: (voucherId: string) => `/admin/vouchers/${voucherId}`,
    searchVoucherUsers: (query: string, limit = 20) => withQuery("/admin/vouchers/search-users", { query, limit }),
    logFiles: (stream: "app" | "audit" = "app") => withQuery("/admin/logs/files", { stream }),
    logEntries: (payload: { stream?: "app" | "audit"; file?: string; limit?: number }) =>
      withQuery("/admin/logs/entries", payload),
    notifications: (limit = 50) => withQuery("/admin/notifications", { limit }),
    notificationSends: (limit = 50) => withQuery("/admin/notifications/sends", { limit }),
    sendNotificationToAllUsers: "/admin/notifications/send-all",
    sendNotificationToUsers: "/admin/notifications/send-users",
    operationsStats: "/admin/operations/stats",
    jobs: (query: AdminJobsQuery = {}) => withQuery("/admin/operations/jobs", query),
    jobRuns: (query: AdminJobRunsQuery = {}) => withQuery("/admin/operations/job-runs", query),
    pendingEmails: (query: AdminPendingEmailsQuery = {}) => withQuery("/admin/operations/pending-emails", query),
  },
} as const;
