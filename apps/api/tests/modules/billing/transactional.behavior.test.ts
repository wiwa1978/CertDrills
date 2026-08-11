import { describe, expect, it, vi } from "vitest";

import { createBillingService } from "../../../src/modules/billing/service";

describe("billing transactional behavior", () => {
  // Verifies transaction-level failures bubble up and do not emit post-commit side effects.
  it("propagates transaction failures and prevents side effects", async () => {
    const notifications = { createNotification: vi.fn() };

    const db = {
      transaction: vi.fn(async () => {
        throw new Error("simulated transaction failure");
      }),
    };

    const service = createBillingService({
      db: db as any,
      env: { DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
      notifications,
    });

    await expect(service.processCreditPurchase("u1", "advanced", "pay_tx_fail", "completed")).rejects.toThrow(
      "simulated transaction failure",
    );
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });
});
