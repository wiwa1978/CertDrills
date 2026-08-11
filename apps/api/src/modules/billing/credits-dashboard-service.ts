import type { AdminCreditsDashboard } from "@platform/contracts";

type TimeRange = "daily" | "weekly" | "monthly" | "yearly";

type AdminCreditsDashboardServiceDeps = {
  adminService: {
    getBillingStats: () => Promise<AdminCreditsDashboard["stats"]>;
    getRevenueData: (timeRange: TimeRange) => Promise<AdminCreditsDashboard["revenue"]["dailyData"]>;
    getCreditsConsumedData: (timeRange: TimeRange) => Promise<AdminCreditsDashboard["consumption"]["dailyData"]>;
    getTransactionData: (timeRange: TimeRange) => Promise<AdminCreditsDashboard["activity"]["dailyData"]>;
    getAllTransactions: (limit?: number, offset?: number, searchEmail?: string) => Promise<{ transactions: AdminCreditsDashboard["transactions"] }>;
    getAllPurchases: (
      limit?: number,
      offset?: number,
      searchEmail?: string,
      paymentStatus?: "pending" | "completed" | "failed" | "refunded",
    ) => Promise<{ purchases: AdminCreditsDashboard["purchases"]; total: number }>;
  };
};

export type AdminCreditsDashboardQuery = {
  creditsPurchasesPage?: number;
  creditsPurchasesSearch?: string;
  creditsRefundsPage?: number;
  creditsRefundsSearch?: string;
};

const PURCHASES_PAGE_SIZE = 20;
const REFUNDS_PAGE_SIZE = 20;

function page(value: number | undefined) {
  return Number.isFinite(value) && value && value > 0 ? Math.trunc(value) : 1;
}

function search(value: string | undefined) {
  return value?.trim() ?? "";
}

function pagination(currentPage: number, pageSize: number, totalItems: number, currentSearch: string) {
  return {
    page: currentPage,
    pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    search: currentSearch,
  };
}

export function createAdminCreditsDashboardService(deps: AdminCreditsDashboardServiceDeps) {
  async function getDashboard(query: AdminCreditsDashboardQuery = {}): Promise<AdminCreditsDashboard> {
    const purchasesPage = page(query.creditsPurchasesPage);
    const purchasesSearch = search(query.creditsPurchasesSearch);
    const refundsPage = page(query.creditsRefundsPage);
    const refundsSearch = search(query.creditsRefundsSearch);

    const [
      stats,
      [dailyRevenueData, weeklyRevenueData, monthlyRevenueData, yearlyRevenueData],
      [dailyConsumptionData, weeklyConsumptionData, monthlyConsumptionData, yearlyConsumptionData],
      [dailyActivityData, weeklyActivityData, monthlyActivityData, yearlyActivityData],
      transactions,
      purchases,
      refundablePurchases,
      refundedPurchases,
    ] = await Promise.all([
      deps.adminService.getBillingStats(),
      Promise.all([
        deps.adminService.getRevenueData("daily"),
        deps.adminService.getRevenueData("weekly"),
        deps.adminService.getRevenueData("monthly"),
        deps.adminService.getRevenueData("yearly"),
      ]),
      Promise.all([
        deps.adminService.getCreditsConsumedData("daily"),
        deps.adminService.getCreditsConsumedData("weekly"),
        deps.adminService.getCreditsConsumedData("monthly"),
        deps.adminService.getCreditsConsumedData("yearly"),
      ]),
      Promise.all([
        deps.adminService.getTransactionData("daily"),
        deps.adminService.getTransactionData("weekly"),
        deps.adminService.getTransactionData("monthly"),
        deps.adminService.getTransactionData("yearly"),
      ]),
      deps.adminService.getAllTransactions(100, 0),
      deps.adminService.getAllPurchases(
        PURCHASES_PAGE_SIZE,
        (purchasesPage - 1) * PURCHASES_PAGE_SIZE,
        purchasesSearch || undefined,
      ),
      deps.adminService.getAllPurchases(
        REFUNDS_PAGE_SIZE,
        (refundsPage - 1) * REFUNDS_PAGE_SIZE,
        refundsSearch || undefined,
        "completed",
      ),
      deps.adminService.getAllPurchases(100, 0, undefined, "refunded"),
    ]);

    return {
      stats: {
        ...stats,
        purchaseBonusCredits: stats.purchaseBonusCredits ?? 0,
        voucherCredits: stats.voucherCredits ?? 0,
        refundCredits: stats.refundCredits ?? 0,
        adminAdjustmentCredits: stats.adminAdjustmentCredits ?? 0,
      },
      revenue: {
        dailyData: dailyRevenueData,
        weeklyData: weeklyRevenueData,
        monthlyData: monthlyRevenueData,
        yearlyData: yearlyRevenueData,
      },
      consumption: {
        dailyData: dailyConsumptionData,
        weeklyData: weeklyConsumptionData,
        monthlyData: monthlyConsumptionData,
        yearlyData: yearlyConsumptionData,
      },
      activity: {
        dailyData: dailyActivityData,
        weeklyData: weeklyActivityData,
        monthlyData: monthlyActivityData,
        yearlyData: yearlyActivityData,
      },
      transactions: transactions.transactions,
      purchases: purchases.purchases,
      refundablePurchases: refundablePurchases.purchases,
      refundedPurchases: refundedPurchases.purchases,
      pagination: {
        purchases: pagination(purchasesPage, PURCHASES_PAGE_SIZE, purchases.total, purchasesSearch),
        refunds: pagination(refundsPage, REFUNDS_PAGE_SIZE, refundablePurchases.total, refundsSearch),
      },
      warnings: [],
    };
  }

  return { getDashboard };
}
