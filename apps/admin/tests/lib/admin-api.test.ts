import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getAdminAllPurchasesApi,
  getAdminAllTransactionsApi,
  getAdminBillingSubscriptionFinanceSummaryApi,
  getAdminBillingSubscriptionEventsApi,
  getAdminBillingSubscriptionPaymentsApi,
  getAdminBillingSubscriptionPlanDistributionApi,
  getAdminBillingSubscriptionStatsApi,
  getAdminBillingSubscriptionsApi,
  getAdminStatusApi,
  getAdminUsersApi,
  stopAdminImpersonationApi,
  verifyAdminSecretApi,
} from "../../src/lib/api/admin";
import { apiRequest } from "../../src/lib/api/client";

vi.mock("../../src/lib/api/client", () => ({
  apiRequest: vi.fn(),
}));

const apiRequestMock = vi.mocked(apiRequest);

describe("admin API", () => {
  beforeEach(() => {
    apiRequestMock.mockClear();
    apiRequestMock.mockResolvedValue({ success: true, data: { users: [], total: 0 } });
  });

  it("forwards trimmed search when fetching admin users", async () => {
    await getAdminUsersApi(50, 100, " alice@example.com ");

    expect(apiRequestMock).toHaveBeenCalledWith("/admin/users?limit=50&offset=100&search=alice%40example.com");
  });

  it("forwards role filter when fetching admin users", async () => {
    await getAdminUsersApi(20, 0, undefined, "admin");

    expect(apiRequestMock).toHaveBeenCalledWith("/admin/users?limit=20&offset=0&role=admin");
  });

  it("encodes search email when fetching admin billing transactions", async () => {
    await getAdminAllTransactionsApi(20, 40, "alice+admin@example.com");

    expect(apiRequestMock).toHaveBeenCalledWith(
      "/admin/billing/transactions?limit=20&offset=40&searchEmail=alice%2Badmin%40example.com",
    );
  });

  it("encodes search email when fetching admin billing purchases", async () => {
    await getAdminAllPurchasesApi(20, 60, "alice+admin@example.com");

    expect(apiRequestMock).toHaveBeenCalledWith(
      "/admin/billing/purchases?limit=20&offset=60&searchEmail=alice%2Badmin%40example.com",
    );
  });

  it("encodes search email when fetching admin billing subscriptions", async () => {
    await getAdminBillingSubscriptionsApi(25, 50, "alice+admin@example.com");

    expect(apiRequestMock).toHaveBeenCalledWith(
      "/admin/billing/subscriptions?limit=25&offset=50&searchEmail=alice%2Badmin%40example.com",
    );
  });

  it("encodes search email when fetching admin billing subscription payments", async () => {
    await getAdminBillingSubscriptionPaymentsApi(25, 50, "alice+admin@example.com");

    expect(apiRequestMock).toHaveBeenCalledWith(
      "/admin/billing/subscription-payments?limit=25&offset=50&searchEmail=alice%2Badmin%40example.com",
    );
  });

  it("fetches admin subscription billing stats", async () => {
    await getAdminBillingSubscriptionStatsApi();

    expect(apiRequestMock).toHaveBeenCalledWith("/admin/billing/subscription-stats");
  });

  it("posts to the stop impersonation endpoint", async () => {
    await stopAdminImpersonationApi();

    expect(apiRequestMock).toHaveBeenCalledWith("/auth/admin/stop-impersonating", {
      method: "POST",
      body: JSON.stringify({}),
    });
  });

  it("calls subscription billing endpoints", async () => {
    await getAdminBillingSubscriptionStatsApi();
    await getAdminBillingSubscriptionFinanceSummaryApi();
    await getAdminBillingSubscriptionPlanDistributionApi();
    await getAdminBillingSubscriptionEventsApi(25);
    await getAdminBillingSubscriptionsApi(20, 40, "alice+admin@example.com");
    await getAdminBillingSubscriptionPaymentsApi(20, 40, "alice+admin@example.com");

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, "/admin/billing/subscription-stats");
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, "/admin/billing/subscription-finance-summary");
    expect(apiRequestMock).toHaveBeenNthCalledWith(3, "/admin/billing/subscription-plan-distribution");
    expect(apiRequestMock).toHaveBeenNthCalledWith(4, "/admin/billing/subscription-events?limit=25");
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      5,
      "/admin/billing/subscriptions?limit=20&offset=40&searchEmail=alice%2Badmin%40example.com",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      6,
      "/admin/billing/subscription-payments?limit=20&offset=40&searchEmail=alice%2Badmin%40example.com",
    );
  });

  it("calls admin status and secret verification endpoints", async () => {
    await getAdminStatusApi();
    await verifyAdminSecretApi("secret");

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, "/admin/status");
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, "/admin/verify-admin-secret", {
      method: "POST",
      body: JSON.stringify({ secret: "secret" }),
    });
  });

  it("types admin status to include allowlisted enrollment capability", async () => {
    apiRequestMock.mockResolvedValueOnce({
      success: true,
      data: {
        message: "Admin access granted.",
        totpRequired: true,
        twoFactorEnabled: false,
        canEnrollTotp: true,
      },
    });

    const response = await getAdminStatusApi();

    expect(response.data.canEnrollTotp).toBe(true);
  });
});
