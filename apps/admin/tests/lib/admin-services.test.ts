import { describe, expect, it, vi } from "vitest";

import {
  getAdminAllPurchases,
  getAdminAllTransactions,
  getAdminBillingStats,
  getAdminBillingSubscriptionEvents,
  getAdminBillingSubscriptionFinanceSummary,
  getAdminBillingSubscriptionPayments,
  getAdminBillingSubscriptionPlanDistribution,
  getAdminBillingSubscriptionStats,
  getAdminBillingSubscriptions,
  getAdminCreditsConsumedData,
  getAdminRevenueData,
  getAdminSystemHealth,
  getAdminTransactionData,
  getUsers,
  stopAdminImpersonation,
} from "../../src/lib/services/admin";
import {
  getAdminAllPurchasesApi,
  getAdminAllTransactionsApi,
  getAdminBillingStatsApi,
  getAdminBillingSubscriptionEventsApi,
  getAdminBillingSubscriptionFinanceSummaryApi,
  getAdminBillingSubscriptionPaymentsApi,
  getAdminBillingSubscriptionPlanDistributionApi,
  getAdminBillingSubscriptionStatsApi,
  getAdminBillingSubscriptionsApi,
  getAdminCreditsConsumedDataApi,
  getAdminRevenueDataApi,
  getAdminTransactionDataApi,
  getAdminUsersApi,
  getSystemHealthApi,
  stopAdminImpersonationApi,
} from "@/lib/api/admin";
import { ApiRequestError } from "@platform/frontend-shared";

vi.mock("../../src/lib/api/admin", () => ({
  getAdminAllPurchasesApi: vi.fn(),
  getAdminAllTransactionsApi: vi.fn(),
  getAdminBillingStatsApi: vi.fn(),
  getAdminBillingSubscriptionEventsApi: vi.fn(),
  getAdminBillingSubscriptionFinanceSummaryApi: vi.fn(),
  getAdminBillingSubscriptionPaymentsApi: vi.fn(),
  getAdminBillingSubscriptionPlanDistributionApi: vi.fn(),
  getAdminBillingSubscriptionStatsApi: vi.fn(),
  getAdminBillingSubscriptionsApi: vi.fn(),
  getAdminCreditsConsumedDataApi: vi.fn(),
  getAdminRevenueDataApi: vi.fn(),
  getAdminTransactionDataApi: vi.fn(),
  getAdminUsersApi: vi.fn(),
  getSystemHealthApi: vi.fn(),
  stopAdminImpersonationApi: vi.fn(),
}));

const getAdminAllPurchasesApiMock = vi.mocked(getAdminAllPurchasesApi);
const getAdminAllTransactionsApiMock = vi.mocked(getAdminAllTransactionsApi);
const getAdminBillingStatsApiMock = vi.mocked(getAdminBillingStatsApi);
const getAdminBillingSubscriptionEventsApiMock = vi.mocked(getAdminBillingSubscriptionEventsApi);
const getAdminBillingSubscriptionFinanceSummaryApiMock = vi.mocked(getAdminBillingSubscriptionFinanceSummaryApi);
const getAdminBillingSubscriptionPaymentsApiMock = vi.mocked(getAdminBillingSubscriptionPaymentsApi);
const getAdminBillingSubscriptionPlanDistributionApiMock = vi.mocked(getAdminBillingSubscriptionPlanDistributionApi);
const getAdminBillingSubscriptionStatsApiMock = vi.mocked(getAdminBillingSubscriptionStatsApi);
const getAdminBillingSubscriptionsApiMock = vi.mocked(getAdminBillingSubscriptionsApi);
const getAdminCreditsConsumedDataApiMock = vi.mocked(getAdminCreditsConsumedDataApi);
const getAdminRevenueDataApiMock = vi.mocked(getAdminRevenueDataApi);
const getAdminTransactionDataApiMock = vi.mocked(getAdminTransactionDataApi);
const getAdminUsersApiMock = vi.mocked(getAdminUsersApi);
const getSystemHealthApiMock = vi.mocked(getSystemHealthApi);
const stopAdminImpersonationApiMock = vi.mocked(stopAdminImpersonationApi);

const disabledCreditsError = new ApiRequestError({
  status: 400,
  message: "API request failed (400): Billing mode disabled: credits",
});

const disabledSubscriptionsError = new ApiRequestError({
  status: 400,
  message: "API request failed (400): Billing mode disabled: subscriptions",
});

describe("admin services", () => {
  it("delegates stopping impersonation to the admin API", async () => {
    const response = { user: { id: "admin-user" } };
    stopAdminImpersonationApiMock.mockResolvedValue(response);

    await expect(stopAdminImpersonation()).resolves.toBe(response);
    expect(stopAdminImpersonationApiMock).toHaveBeenCalledOnce();
  });

  it("returns empty credit chart data when credit billing is disabled", async () => {
    getAdminTransactionDataApiMock.mockRejectedValue(disabledCreditsError);
    getAdminCreditsConsumedDataApiMock.mockRejectedValue(disabledCreditsError);
    getAdminRevenueDataApiMock.mockRejectedValue(disabledCreditsError);

    await expect(getAdminTransactionData("daily")).resolves.toEqual([]);
    await expect(getAdminCreditsConsumedData("daily")).resolves.toEqual([]);
    await expect(getAdminRevenueData("daily")).resolves.toEqual([]);
  });

  it("delegates subscription stats to the admin API", async () => {
    const stats = {
      totalSubscriptions: 3,
      activeSubscriptions: 2,
      trialingSubscriptions: 1,
      pastDueSubscriptions: 0,
      canceledSubscriptions: 0,
      monthlyRecurringRevenue: 49,
      annualRecurringRevenue: 588,
    };
    getAdminBillingSubscriptionStatsApiMock.mockResolvedValue(stats);

    await expect(getAdminBillingSubscriptionStats()).resolves.toBe(stats);
    expect(getAdminBillingSubscriptionStatsApiMock).toHaveBeenCalledOnce();
  });

  it("delegates subscription list queries to the admin API", async () => {
    const subscriptions = { subscriptions: [], total: 0, hasMore: false };
    getAdminBillingSubscriptionsApiMock.mockResolvedValue(subscriptions);

    await expect(getAdminBillingSubscriptions(25, 50, "alice@example.com")).resolves.toBe(subscriptions);
    expect(getAdminBillingSubscriptionsApiMock).toHaveBeenCalledWith(25, 50, "alice@example.com");
  });

  it("delegates subscription payment list queries to the admin API", async () => {
    const payments = { payments: [], total: 0, hasMore: false };
    getAdminBillingSubscriptionPaymentsApiMock.mockResolvedValue(payments);

    await expect(getAdminBillingSubscriptionPayments(25, 50, "alice@example.com")).resolves.toBe(payments);
    expect(getAdminBillingSubscriptionPaymentsApiMock).toHaveBeenCalledWith(25, 50, "alice@example.com");
  });

  it("delegates subscription finance summary to the admin API", async () => {
    const summary = {
      currency: "EUR",
      grossRevenue: 19,
      refundedRevenue: 9,
      netRevenue: 10,
      totalPayments: 4,
      completedPayments: 1,
      refundedPayments: 1,
      failedPayments: 1,
      pendingPayments: 1,
      providerFinanceAvailable: true,
      providerPaymentsChecked: 2,
      providerSubscriptionsChecked: 2,
      unmatchedProviderPayments: 1,
      unmatchedProviderSubscriptions: 1,
    };
    getAdminBillingSubscriptionFinanceSummaryApiMock.mockResolvedValue(summary);

    await expect(getAdminBillingSubscriptionFinanceSummary()).resolves.toBe(summary);
    expect(getAdminBillingSubscriptionFinanceSummaryApiMock).toHaveBeenCalledOnce();
  });

  it("delegates admin account list queries with admin role filtering", async () => {
    const users = { users: [], total: 0 };
    getAdminUsersApiMock.mockResolvedValue(users);

    await expect(getUsers(20, 40, "alice@example.com", "admin")).resolves.toEqual({ data: users, error: null });
    expect(getAdminUsersApiMock).toHaveBeenCalledWith(20, 40, "alice@example.com", "admin");
  });

  it("returns unavailable system health when the health API cannot be reached", async () => {
    getSystemHealthApiMock.mockRejectedValue(new Error("network"));

    await expect(getAdminSystemHealth()).resolves.toEqual({ status: "unavailable" });
  });
});
