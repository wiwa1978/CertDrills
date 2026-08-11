import { describe, expect, it, vi } from "vitest";

import { createCapabilityService } from "../../../src/modules/billing/capability-service";

const definitions = [
  { key: "free.read", defaultAccess: "allowed", consumption: "none" },
  { key: "reports.export", defaultAccess: "denied", consumption: "none", grants: { plans: ["Gold"] } },
  { key: "content.open", defaultAccess: "denied", consumption: "entitlement", grants: { transactionProducts: ["contentPack"] } },
  { key: "ai.run", defaultAccess: "allowed", consumption: "credits", creditCost: 2 },
] as const;

function resolvedSelect(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

describe("capability service", () => {
  it("maps active plans and available transaction products to capability keys", async () => {
    const db = {
      select: vi.fn()
        .mockReturnValueOnce(resolvedSelect([{ planKey: "Gold" }]))
        .mockReturnValueOnce(resolvedSelect([{ productKey: "contentPack" }])),
    };
    const service = createCapabilityService({
      db: db as never,
      definitions,
      consumeCredits: vi.fn(),
    });

    await expect(service.resolveForUser("user-1")).resolves.toEqual([
      "free.read",
      "reports.export",
      "content.open",
      "ai.run",
    ]);
  });

  it("delegates credit consumption without accepting a client amount", async () => {
    const consumeCredits = vi.fn(async () => ({
      transactionId: "transaction-1",
      idempotencyKey: "request-12345678",
      balanceBefore: "5.00",
      balanceAfter: "3.00",
      alreadyProcessed: false,
    }));
    const service = createCapabilityService({ db: {} as never, definitions, consumeCredits });

    await expect(service.consume("user-1", "ai.run", {
      idempotencyKey: "request-12345678",
    })).resolves.toMatchObject({ capabilityKey: "ai.run", consumption: "credits", balanceAfter: "3.00" });
    expect(consumeCredits).toHaveBeenCalledWith("user-1", {
      featureKey: "ai.run",
      idempotencyKey: "request-12345678",
    });
  });

  it("locks and consumes one matching entitlement atomically", async () => {
    const selection = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue([{ id: "entitlement-1" }]),
            }),
          }),
        }),
      }),
    };
    const update = {
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "entitlement-1" }]),
        }),
      }),
    };
    const tx = { select: vi.fn().mockReturnValue(selection), update: vi.fn().mockReturnValue(update) };
    const service = createCapabilityService({
      db: { transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)) } as never,
      definitions,
      consumeCredits: vi.fn(),
    });

    await expect(service.consume("user-1", "content.open", {
      idempotencyKey: "request-12345678",
    })).resolves.toEqual({
      capabilityKey: "content.open",
      entitlementId: "entitlement-1",
      consumption: "entitlement",
    });
    expect(update.set).toHaveBeenCalledWith(expect.objectContaining({ status: "consumed" }));
  });
});
