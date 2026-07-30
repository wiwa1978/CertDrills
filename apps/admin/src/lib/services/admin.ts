import {
  banAdminUserApi,
  createAdminCreditRefundApi,
  createAdminSubscriptionRefundApi,
  getAdminAllPurchasesApi,
  getAdminAllSubscriptionsApi,
  getAdminAllTransactionsApi,
  getAdminBillingStatsApi,
  getAdminBillingSubscriptionEventsApi,
  getAdminBillingSubscriptionFinanceSummaryApi,
  getAdminBillingSubscriptionFinanceDashboardApi,
  getAdminBillingSubscriptionPaymentsApi,
  getAdminBillingSubscriptionPlanDistributionApi,
  getAdminBillingSubscriptionStatsApi,
  getAdminBillingSubscriptionsApi,
  getAdminCreditsConsumedDataApi,
  getAdminCreditsDashboardApi,
  getAdminDashboardStatsApi,
  getSystemHealthApi,
  getAdminRevenueDataApi,
  getAdminSubscriptionStatsApi,
  getAdminTransactionDataApi,
  getAdminUserApi,
  getAdminUserCreditBalanceApi,
  getAdminUserCreditHistoryApi,
  getAdminUserCreditPurchasesApi,
  getAdminUserStatsApi,
  getAdminUsersApi,
  getAdminWebhookEventApi,
  getAdminWebhookEventsApi,
  getAdminWebhookStatsApi,
  impersonateAdminUserApi,
  revokeAdminUserSessionsApi,
  setAdminUserPasswordApi,
  setAdminUserRoleApi,
  stopAdminImpersonationApi,
  unbanAdminUserApi,
  type AdminWebhookEventsQuery,
  type AdminCreditsDashboardQuery,
  verifyAdminSecretApi,
  getAdminStatusApi,
} from "@/lib/api/admin";
import type {
  AdminDashboardStats,
  AdminCreditRefundResponseData,
  AdminCreditsDashboard,
  AdminSubscriptionRefundResponseData,
  AdminUserDetail,
  AdminUsersList,
  AdminUserStats,
  AdminWebhookEvent,
  AdminWebhookEventsList,
  AdminWebhookStats,
  BillingStats,
  CreditBalance,
  CreditPurchase,
  CreditTransaction,
  CreditsConsumedPoint,
  PurchasesList,
  RevenuePoint,
  SubscriptionEvent,
  SubscriptionFinanceSummary,
  AdminSubscriptionFinanceDashboard,
  SubscriptionPlanDistributionPoint,
  SubscriptionPaymentsList,
  SubscriptionStats,
  SubscriptionsList,
  TransactionPoint,
  TransactionsList,
} from "@platform/contracts";
import { ApiRequestError } from "@platform/frontend-shared";

export type TimeRange = "daily" | "weekly" | "monthly" | "yearly";

function isCreditBillingDisabledError(error: unknown) {
  return (
    error instanceof ApiRequestError &&
    error.status === 400 &&
    error.message.includes("Billing mode disabled: credits")
  );
}

function isSubscriptionBillingDisabledError(error: unknown) {
  return (
    error instanceof ApiRequestError &&
    error.status === 400 &&
    error.message.includes("Billing mode disabled: subscriptions")
  );
}

const emptyBillingStats: BillingStats = {
  totalPurchases: 0,
  totalCreditsPurchased: 0,
  purchasedCredits: 0,
  bonusCredits: 0,
  totalCreditsConsumed: 0,
  totalRevenue: 0,
};

const emptyTransactionsList: TransactionsList = { transactions: [], total: 0, hasMore: false };
const emptyPurchasesList: PurchasesList = { purchases: [], total: 0, hasMore: false };
const emptySubscriptionStats: SubscriptionStats = {
  totalSubscriptions: 0,
  activeSubscriptions: 0,
  trialingSubscriptions: 0,
  pastDueSubscriptions: 0,
  canceledSubscriptions: 0,
  monthlyRecurringRevenue: 0,
  annualRecurringRevenue: 0,
};
const emptySubscriptionsList: SubscriptionsList = { subscriptions: [], total: 0, hasMore: false };
const emptySubscriptionPaymentsList: SubscriptionPaymentsList = { payments: [], total: 0, hasMore: false };
const emptySubscriptionFinanceSummary: SubscriptionFinanceSummary = {
  currency: "EUR",
  grossRevenue: 0,
  refundedRevenue: 0,
  netRevenue: 0,
  totalPayments: 0,
  completedPayments: 0,
  refundedPayments: 0,
  failedPayments: 0,
  pendingPayments: 0,
  providerFinanceAvailable: false,
  providerPaymentsChecked: 0,
  providerSubscriptionsChecked: 0,
  unmatchedProviderPayments: 0,
  unmatchedProviderSubscriptions: 0,
};

async function getCreditBillingChartData<T>(loadData: () => Promise<T[]>): Promise<T[]> {
  try {
    return await loadData();
  } catch (error) {
    if (isCreditBillingDisabledError(error)) {
      return [];
    }

    throw error;
  }
}

export async function verifyAdminSecret(secret: string) {
  return verifyAdminSecretApi(secret);
}

export async function getAdminStatus() {
  return getAdminStatusApi();
}

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  return getAdminDashboardStatsApi();
}

export async function getAdminSystemHealth() {
  try {
    return await getSystemHealthApi();
  } catch {
    return { status: "unavailable" };
  }
}

export async function getAdminUserStats() {
  try {
    const stats: AdminUserStats = await getAdminUserStatsApi();

    return stats;
  } catch {
    return {
      totalUsers: 0,
      totalAdmins: 0,
      totalBanned: 0,
    };
  }
}

export async function getAdminUser(userId: string) {
  try {
    const response = await getAdminUserApi(userId);

    if (!response.success || !response.data) {
      return { data: null, error: response.error || "User not found" };
    }

    return { data: response.data, error: null };
  } catch {
    return { data: null, error: "Failed to fetch user" };
  }
}

export async function getAdminUserCreditBalance(userId: string): Promise<CreditBalance> {
  return getAdminUserCreditBalanceApi(userId);
}

export async function getAdminUserCreditHistory(userId: string, limit: number = 50) {
  const history: CreditTransaction[] = await getAdminUserCreditHistoryApi(userId);
  if (Array.isArray(history)) {
    return history.slice(0, limit);
  }

  return [];
}

export async function getAdminUserCreditPurchases(userId: string, limit: number = 50) {
  const purchases: CreditPurchase[] = await getAdminUserCreditPurchasesApi(userId);
  if (Array.isArray(purchases)) {
    return purchases.slice(0, limit);
  }

  return [];
}

export async function getAdminBillingStats(): Promise<BillingStats> {
  try {
    return await getAdminBillingStatsApi();
  } catch (error) {
    if (isCreditBillingDisabledError(error)) {
      return emptyBillingStats;
    }

    throw error;
  }
}

export async function getAdminRevenueData(timeRange: TimeRange): Promise<RevenuePoint[]> {
  return getCreditBillingChartData(() => getAdminRevenueDataApi(timeRange));
}

export async function getAdminAllTransactions(limit: number = 20, offset: number = 0, searchEmail?: string) {
  try {
    return await getAdminAllTransactionsApi(limit, offset, searchEmail);
  } catch (error) {
    if (isCreditBillingDisabledError(error)) {
      return emptyTransactionsList;
    }

    throw error;
  }
}

export async function getAdminAllPurchases(limit: number = 20, offset: number = 0, searchEmail?: string) {
  try {
    return await getAdminAllPurchasesApi(limit, offset, searchEmail);
  } catch (error) {
    if (isCreditBillingDisabledError(error)) {
      return emptyPurchasesList;
    }

    throw error;
  }
}

export async function getAdminAllSubscriptions(
  limit: number = 20,
  offset: number = 0,
  searchEmail?: string,
): Promise<SubscriptionsList> {
  return getAdminAllSubscriptionsApi(limit, offset, searchEmail);
}

export async function getAdminSubscriptionStats(): Promise<SubscriptionStats> {
  return getAdminSubscriptionStatsApi();
}

export async function getAdminTransactionData(timeRange: TimeRange): Promise<TransactionPoint[]> {
  return getCreditBillingChartData(() => getAdminTransactionDataApi(timeRange));
}

export async function getAdminCreditsConsumedData(timeRange: TimeRange): Promise<CreditsConsumedPoint[]> {
  return getCreditBillingChartData(() => getAdminCreditsConsumedDataApi(timeRange));
}

export async function getAdminCreditsDashboard(query: AdminCreditsDashboardQuery = {}): Promise<AdminCreditsDashboard> {
  return getAdminCreditsDashboardApi(query);
}

export async function createAdminCreditRefund(payload: { paymentId: string; reason?: string; secret: string }): Promise<AdminCreditRefundResponseData> {
  return createAdminCreditRefundApi(payload);
}

export async function getAdminBillingSubscriptionStats(): Promise<SubscriptionStats> {
  try {
    return await getAdminBillingSubscriptionStatsApi();
  } catch (error) {
    if (isSubscriptionBillingDisabledError(error)) {
      return emptySubscriptionStats;
    }

    throw error;
  }
}

export async function getAdminBillingSubscriptionFinanceSummary(): Promise<SubscriptionFinanceSummary> {
  try {
    return await getAdminBillingSubscriptionFinanceSummaryApi();
  } catch (error) {
    if (isSubscriptionBillingDisabledError(error)) {
      return emptySubscriptionFinanceSummary;
    }

    throw error;
  }
}

export async function getAdminBillingSubscriptionFinanceDashboard(): Promise<AdminSubscriptionFinanceDashboard> {
  return getAdminBillingSubscriptionFinanceDashboardApi();
}

export async function getAdminBillingSubscriptions(limit: number = 20, offset: number = 0, searchEmail?: string): Promise<SubscriptionsList> {
  try {
    return await getAdminBillingSubscriptionsApi(limit, offset, searchEmail);
  } catch (error) {
    if (isSubscriptionBillingDisabledError(error)) {
      return emptySubscriptionsList;
    }

    throw error;
  }
}

export async function getAdminBillingSubscriptionPayments(limit: number = 20, offset: number = 0, searchEmail?: string): Promise<SubscriptionPaymentsList> {
  try {
    return await getAdminBillingSubscriptionPaymentsApi(limit, offset, searchEmail);
  } catch (error) {
    if (isSubscriptionBillingDisabledError(error)) {
      return emptySubscriptionPaymentsList;
    }

    throw error;
  }
}

export async function createAdminSubscriptionRefund(payload: { paymentId: string; reason?: string; secret: string }): Promise<AdminSubscriptionRefundResponseData> {
  return createAdminSubscriptionRefundApi(payload);
}

export async function getAdminBillingSubscriptionPlanDistribution(): Promise<SubscriptionPlanDistributionPoint[]> {
  try {
    return await getAdminBillingSubscriptionPlanDistributionApi();
  } catch (error) {
    if (isSubscriptionBillingDisabledError(error)) {
      return [];
    }

    throw error;
  }
}

export async function getAdminBillingSubscriptionEvents(limit: number = 50): Promise<SubscriptionEvent[]> {
  try {
    return await getAdminBillingSubscriptionEventsApi(limit);
  } catch (error) {
    if (isSubscriptionBillingDisabledError(error)) {
      return [];
    }

    throw error;
  }
}

export async function getAdminWebhookEvents(query: AdminWebhookEventsQuery = {}): Promise<AdminWebhookEventsList> {
  try {
    return await getAdminWebhookEventsApi(query);
  } catch {
    return { events: [], total: 0 };
  }
}

export async function getAdminWebhookStats(): Promise<AdminWebhookStats> {
  try {
    return await getAdminWebhookStatsApi();
  } catch {
    return { total: 0, processing: 0, processed: 0, failed: 0 };
  }
}

export async function getAdminWebhookEvent(eventId: string): Promise<AdminWebhookEvent | null> {
  try {
    return await getAdminWebhookEventApi(eventId);
  } catch {
    return null;
  }
}

export async function getUsers(
  limit = 20,
  offset = 0,
  search?: string,
  role?: "user" | "admin",
): Promise<{ data: AdminUsersList; error: string | null }> {
  try {
    const result: AdminUsersList = await getAdminUsersApi(limit, offset, search, role);

    return { data: result, error: null };
  } catch {
    return { data: { users: [], total: 0 }, error: "Failed to fetch users" };
  }
}

export async function setAdminUserRole(
  userId: string,
  role: "user" | "admin",
  options: { reason?: string; confirmed?: boolean; secret: string },
) {
  return setAdminUserRoleApi(userId, role, options);
}

export async function unbanAdminUser(userId: string, secret: string) {
  return unbanAdminUserApi(userId, secret);
}

export async function banAdminUser(payload: { userId: string; secret: string; banReason?: string; banExpiresIn?: number }) {
  return banAdminUserApi(payload);
}

export async function impersonateAdminUser(userId: string, secret: string) {
  return impersonateAdminUserApi(userId, secret);
}

export async function stopAdminImpersonation(): ReturnType<typeof stopAdminImpersonationApi> {
  return stopAdminImpersonationApi();
}

export async function revokeAdminUserSessions(userId: string, secret: string) {
  return revokeAdminUserSessionsApi(userId, secret);
}

export async function setAdminUserPassword(userId: string, newPassword: string, secret: string) {
  return setAdminUserPasswordApi(userId, newPassword, secret);
}
