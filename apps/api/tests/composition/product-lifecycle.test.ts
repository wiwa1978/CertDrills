import { describe, expect, it, vi } from "vitest";

import { createProductLifecycleCoordinator } from "../../src/composition/product-lifecycle";

describe("product lifecycle coordinator", () => {
  it("runs every registered product deletion hook", async () => {
    const deleteCatalogData = vi.fn(async () => undefined);
    const deleteReportsData = vi.fn(async () => undefined);
    const coordinator = createProductLifecycleCoordinator();
    coordinator.setPrivacyContributions(new Map([
      ["catalog", { exportUserData: vi.fn(), deleteUserData: deleteCatalogData }],
      ["reports", { exportUserData: vi.fn(), deleteUserData: deleteReportsData }],
    ]));

    await coordinator.deleteUserData("user-1");

    expect(deleteCatalogData).toHaveBeenCalledWith("user-1");
    expect(deleteReportsData).toHaveBeenCalledWith("user-1");
  });
});
