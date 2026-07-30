import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm";

import { paymentWebhookEvents } from "@platform/platform-db";

type WebhookRecoveryDeps = {
  db: any;
};

const MAX_RETRIES = 5;
const STALE_PROCESSING_MINUTES = 15;

function nextAttempt(retryCount: number) {
  return new Date(Date.now() + Math.min(3600, 60 * 2 ** Math.max(0, retryCount - 1)) * 1000);
}

export function createWebhookRecoveryService(deps: WebhookRecoveryDeps) {
  async function recoverFailed(limit = 25) {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MINUTES * 60 * 1000);
    const rows = await deps.db
      .select()
      .from(paymentWebhookEvents)
      .where(or(
        and(eq(paymentWebhookEvents.processingStatus, "failed"), or(isNull(paymentWebhookEvents.nextAttemptAt), lte(paymentWebhookEvents.nextAttemptAt, now))),
        and(eq(paymentWebhookEvents.processingStatus, "processing"), lte(paymentWebhookEvents.updatedAt, staleBefore)),
      ))
      .orderBy(asc(paymentWebhookEvents.updatedAt))
      .limit(limit);

    let recoverable = 0;
    let deadLettered = 0;
    for (const row of rows) {
      const retryCount = (row.retryCount ?? 0) + 1;
      if (retryCount > MAX_RETRIES) {
        deadLettered += 1;
        await deps.db.update(paymentWebhookEvents).set({
          processingStatus: "dead_lettered",
          retryCount,
          deadLetteredAt: now,
          updatedAt: now,
        }).where(eq(paymentWebhookEvents.id, row.id));
      } else {
        recoverable += 1;
        await deps.db.update(paymentWebhookEvents).set({
          processingStatus: "failed",
          retryCount,
          nextAttemptAt: nextAttempt(retryCount),
          updatedAt: now,
        }).where(eq(paymentWebhookEvents.id, row.id));
      }
    }

    return { checked: rows.length, recoverable, deadLettered };
  }

  async function listRecoverable(limit = 50) {
    return deps.db
      .select()
      .from(paymentWebhookEvents)
      .where(inArray(paymentWebhookEvents.processingStatus, ["failed", "processing"]))
      .orderBy(asc(paymentWebhookEvents.updatedAt))
      .limit(limit);
  }

  return { recoverFailed, listRecoverable };
}
