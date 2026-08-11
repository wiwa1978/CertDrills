import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";

import { paymentWebhookEvents } from "@platform/platform-db";

import { createWebhookRecoveryService } from "../../src/modules/payments/webhook-recovery";
import { fixtureToken, openTestDatabase } from "../support/database";

const providerEventIds = new Set<string>();
let database: ReturnType<typeof openTestDatabase>;

async function failedEvent(retryCount = 0) {
  const providerEventId = fixtureToken("webhook-recovery");
  providerEventIds.add(providerEventId);
  const [event] = await database.db.insert(paymentWebhookEvents).values({
    provider: "integration",
    providerEventId,
    eventType: "payment.succeeded",
    paymentId: fixtureToken("webhook-payment"),
    sanitizedPayload: { type: "payment.succeeded", data: { paymentId: "payment-1" } },
    processingStatus: "failed",
    retryCount,
    nextAttemptAt: new Date(Date.now() - 1_000),
    failedAt: new Date(Date.now() - 1_000),
    updatedAt: new Date(Date.now() - 1_000),
  }).returning();
  if (!event) throw new Error("Failed to create webhook recovery fixture");
  return event;
}

describe("webhook recovery PostgreSQL integration", () => {
  beforeAll(() => {
    database = openTestDatabase();
  });

  afterEach(async () => {
    const ids = [...providerEventIds];
    providerEventIds.clear();
    if (ids.length > 0) {
      await database.db.delete(paymentWebhookEvents).where(inArray(paymentWebhookEvents.providerEventId, ids));
    }
  });

  afterAll(async () => {
    await database.sql.end();
  });

  it("claims a recoverable webhook only once across concurrent workers", async () => {
    const event = await failedEvent();
    const replay = vi.fn(async () => undefined);
    const first = createWebhookRecoveryService({ db: database.db, replay });
    const second = createWebhookRecoveryService({ db: database.db, replay });

    const results = await Promise.all([first.recoverFailed(), second.recoverFailed()]);

    expect(results.reduce((total, result) => total + result.processed, 0)).toBe(1);
    expect(replay).toHaveBeenCalledTimes(1);
    expect(replay).toHaveBeenCalledWith("integration", event.sanitizedPayload);

    const stored = await database.db.query.paymentWebhookEvents.findFirst({
      where: (table, { eq }) => eq(table.id, event.id),
    });
    expect(stored?.processingStatus).toBe("processed");
    expect(stored?.retryCount).toBe(1);
    expect(stored?.processedAt).toBeInstanceOf(Date);
  });

  it("dead-letters an exhausted webhook after a failed replay", async () => {
    const event = await failedEvent(4);
    const onRecoveryFailure = vi.fn();
    const service = createWebhookRecoveryService({
      db: database.db,
      replay: async () => {
        throw new Error("provider unavailable");
      },
      onRecoveryFailure,
    });

    await expect(service.recoverFailed()).resolves.toMatchObject({ checked: 1, deadLettered: 1 });

    const stored = await database.db.query.paymentWebhookEvents.findFirst({
      where: (table, { eq }) => eq(table.id, event.id),
    });
    expect(stored?.processingStatus).toBe("dead_lettered");
    expect(stored?.retryCount).toBe(5);
    expect(stored?.nextAttemptAt).toBeNull();
    expect(stored?.errorDetails).toEqual({ message: "provider unavailable" });
    expect(onRecoveryFailure).toHaveBeenCalledOnce();
  });
});
