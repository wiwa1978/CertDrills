import { describe, expect, it, vi } from "vitest";

import { stopAdminImpersonation } from "../../src/lib/services/admin";
import { stopAdminImpersonationApi } from "../../src/lib/api/admin";

vi.mock("../../src/lib/api/admin", () => ({
  stopAdminImpersonationApi: vi.fn(),
}));

const stopAdminImpersonationApiMock = vi.mocked(stopAdminImpersonationApi);

describe("web admin services", () => {
  it("delegates stopping impersonation to the admin API", async () => {
    const response = { user: { id: "admin-user" } };
    stopAdminImpersonationApiMock.mockResolvedValue(response);

    await expect(stopAdminImpersonation()).resolves.toBe(response);
    expect(stopAdminImpersonationApiMock).toHaveBeenCalledOnce();
  });
});
