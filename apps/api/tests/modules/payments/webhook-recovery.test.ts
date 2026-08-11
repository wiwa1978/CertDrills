import { describe, expect, it, vi } from "vitest";

import { createWebhookRecoveryService } from "../../../src/modules/payments/webhook-recovery";

function recoveryDb(candidate: Record<string, unknown>, claimed: Record<string, unknown> | null = candidate) {
  const outcomeSets: unknown[] = [];
  const claimSets: unknown[] = [];
  const tx = {
    execute: vi.fn().mockResolvedValue([candidate]),
    update: vi.fn(() => ({ set: vi.fn((value) => {
      claimSets.push(value);
      return {
        where: vi.fn(() => claimed
          ? { returning: vi.fn().mockResolvedValue([claimed]) }
          : Promise.resolve(undefined)),
      };
    }) })),
  };
  const db = {
    transaction: vi.fn(async (callback: (value: unknown) => Promise<unknown>) => callback(tx)),
    update: vi.fn(() => ({ set: vi.fn((value) => {
      outcomeSets.push(value);
      return { where: vi.fn().mockResolvedValue(undefined) };
    }) })),
  };
  return { db, tx, claimSets, outcomeSets };
}

describe("webhook recovery service", () => {
  it("claims failed events, replays their sanitized payload, and marks them processed", async () => {
    const now = new Date("2026-08-09T12:00:00.000Z");
    const event = { id: "event-1", provider: "dodo", providerEventId: "evt-1", retryCount: 1, sanitizedPayload: { id: "evt-1" } };
    const setup = recoveryDb(event, { ...event, retryCount: 2 });
    const replay = vi.fn().mockResolvedValue(undefined);
    const service = createWebhookRecoveryService({ db: setup.db as never, replay, now: () => now });

    await expect(service.recoverFailed()).resolves.toEqual({ checked: 1, processed: 1, failed: 0, deadLettered: 0 });
    expect(replay).toHaveBeenCalledWith("dodo", { id: "evt-1" });
    expect(setup.outcomeSets).toContainEqual(expect.objectContaining({ processingStatus: "processed", processedAt: now, nextAttemptAt: null }));
  });

  it("dead-letters an event when its fifth replay attempt fails", async () => {
    const now = new Date("2026-08-09T12:00:00.000Z");
    const event = { id: "event-2", provider: "dodo", providerEventId: "evt-2", retryCount: 4, sanitizedPayload: { token: "[redacted]" } };
    const setup = recoveryDb(event, { ...event, retryCount: 5 });
    const onRecoveryFailure = vi.fn();
    const service = createWebhookRecoveryService({
      db: setup.db as never,
      replay: vi.fn().mockRejectedValue(new Error("provider token secret-value")),
      onRecoveryFailure,
      now: () => now,
    });

    await expect(service.recoverFailed()).resolves.toEqual({ checked: 1, processed: 0, failed: 0, deadLettered: 1 });
    expect(setup.outcomeSets).toContainEqual(expect.objectContaining({ processingStatus: "dead_lettered", deadLetteredAt: now, nextAttemptAt: null }));
    expect(onRecoveryFailure).toHaveBeenCalledWith(expect.objectContaining({ providerEventId: "evt-2" }));
  });
});
