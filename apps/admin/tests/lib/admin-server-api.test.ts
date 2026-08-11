import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAdminBillingTransactionFinanceDashboardServer } from "../../src/lib/api/admin.server";
import { serverApiRequest } from "../../src/lib/api/client.server";

vi.mock("../../src/lib/api/client.server", () => ({
  serverApiRequest: vi.fn(),
}));

const serverApiRequestMock = vi.mocked(serverApiRequest);

describe("admin server API", () => {
  beforeEach(() => {
    serverApiRequestMock.mockReset();
  });

  it("fetches and unwraps the transaction finance dashboard", async () => {
    const dashboard = { warnings: [{ source: "provider", message: "Unavailable" }] } as never;
    serverApiRequestMock.mockResolvedValue({ success: true, data: dashboard });

    await expect(getAdminBillingTransactionFinanceDashboardServer({
      range: "custom",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      search: "alice+admin@example.com",
      page: 2,
    })).resolves.toBe(dashboard);
    expect(serverApiRequestMock).toHaveBeenCalledWith(
      "/admin/billing/transaction-dashboard?range=custom&startDate=2026-07-01&endDate=2026-07-31&search=alice%2Badmin%40example.com&page=2",
    );
  });
});
