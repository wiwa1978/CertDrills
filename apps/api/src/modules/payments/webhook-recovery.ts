import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { createPlatformDb, paymentWebhookEvents } from "@platform/platform-db";

import { redactString } from "../../observability/redaction";

type PlatformDb = ReturnType<typeof createPlatformDb>["db"];

type WebhookRecoveryDeps = {
  db: PlatformDb;
  replay: (provider: string, payload: unknown) => Promise<void>;
  onRecoveryFailure?: (event: { provider: string; providerEventId: string; error: string }) => Promise<void> | void;
  now?: () => Date;
};

const MAX_RETRIES = 5;
const STALE_PROCESSING_MINUTES = 15;

function nextAttempt(now: Date, retryCount: number) {
  return new Date(now.getTime() + Math.min(3600, 60 * 2 ** Math.max(0, retryCount - 1)) * 1000);
}

function safeError(error: unknown) {
  return redactString(error instanceof Error ? error.message : String(error));
}

export function createWebhookRecoveryService(deps: WebhookRecoveryDeps) {
  async function claimRecoverable(limit: number) {
    const now = deps.now?.() ?? new Date();
    const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MINUTES * 60 * 1000);

    return deps.db.transaction(async (tx) => {
      const selected = await tx.execute(sql<{ id: string; retryCount: number }>`
        select id, retry_count as "retryCount"
        from payment_webhook_events
        where (
          (processing_status = 'failed' and (next_attempt_at is null or next_attempt_at <= ${now.toISOString()}))
          or (processing_status = 'processing' and updated_at <= ${staleBefore.toISOString()})
        )
        order by updated_at asc
        for update skip locked
        limit ${limit}
      `);
      const candidates = Array.from(selected) as Array<{ id: string; retryCount: number }>;
      const deadIds = candidates.filter((row) => Number(row.retryCount ?? 0) >= MAX_RETRIES).map((row) => row.id);
      const retryIds = candidates.filter((row) => Number(row.retryCount ?? 0) < MAX_RETRIES).map((row) => row.id);

      if (deadIds.length) {
        await tx
          .update(paymentWebhookEvents)
          .set({ processingStatus: "dead_lettered", deadLetteredAt: now, nextAttemptAt: null, updatedAt: now })
          .where(inArray(paymentWebhookEvents.id, deadIds));
      }

      const claimed = retryIds.length
        ? await tx
            .update(paymentWebhookEvents)
            .set({
              processingStatus: "processing",
              retryCount: sql`${paymentWebhookEvents.retryCount} + 1`,
              nextAttemptAt: null,
              updatedAt: now,
            })
            .where(inArray(paymentWebhookEvents.id, retryIds))
            .returning()
        : [];

      return { claimed, deadLettered: deadIds.length };
    });
  }

  async function recoverFailed(limit = 25) {
    const { claimed, deadLettered: initiallyDeadLettered } = await claimRecoverable(Math.min(Math.max(limit, 1), 100));
    let processed = 0;
    let failed = 0;
    let deadLettered = initiallyDeadLettered;

    for (const row of claimed) {
      const startedAt = Date.now();
      try {
        await deps.replay(row.provider, row.sanitizedPayload);
        const completedAt = deps.now?.() ?? new Date();
        await deps.db
          .update(paymentWebhookEvents)
          .set({
            processingStatus: "processed",
            processedAt: completedAt,
            failedAt: null,
            errorDetails: null,
            nextAttemptAt: null,
            durationMs: Date.now() - startedAt,
            updatedAt: completedAt,
          })
          .where(and(eq(paymentWebhookEvents.id, row.id), eq(paymentWebhookEvents.processingStatus, "processing")));
        processed += 1;
      } catch (error) {
        const failedAt = deps.now?.() ?? new Date();
        const retryCount = row.retryCount ?? 1;
        const exhausted = retryCount >= MAX_RETRIES;
        await deps.db
          .update(paymentWebhookEvents)
          .set({
            processingStatus: exhausted ? "dead_lettered" : "failed",
            failedAt,
            deadLetteredAt: exhausted ? failedAt : null,
            nextAttemptAt: exhausted ? null : nextAttempt(failedAt, retryCount),
            durationMs: Date.now() - startedAt,
            errorDetails: { message: safeError(error) },
            updatedAt: failedAt,
          })
          .where(and(eq(paymentWebhookEvents.id, row.id), eq(paymentWebhookEvents.processingStatus, "processing")));

        await deps.onRecoveryFailure?.({
          provider: row.provider,
          providerEventId: row.providerEventId,
          error: safeError(error),
        });
        if (exhausted) deadLettered += 1;
        else failed += 1;
      }
    }

    return { checked: claimed.length + initiallyDeadLettered, processed, failed, deadLettered };
  }

  async function listRecoverable(limit = 50) {
    return deps.db
      .select()
      .from(paymentWebhookEvents)
      .where(inArray(paymentWebhookEvents.processingStatus, ["failed", "processing", "dead_lettered"]))
      .orderBy(asc(paymentWebhookEvents.updatedAt))
      .limit(Math.min(Math.max(limit, 1), 100));
  }

  return { recoverFailed, listRecoverable };
}
