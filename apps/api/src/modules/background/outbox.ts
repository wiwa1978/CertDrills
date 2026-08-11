import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";

import {
  backgroundEvents,
  type PlatformDb,
  type PlatformDbExecutor,
} from "@platform/platform-db";

export type BackgroundEventInput = {
  id?: string;
  name: string;
  data: Record<string, unknown>;
  dedupeKey?: string;
};

type InngestSender = (event: {
  id: string;
  name: string;
  data: Record<string, unknown>;
}) => Promise<{ ids: string[] }>;

type OutboxPublisherDeps = {
  db: PlatformDb;
  send: InngestSender;
  publisherId?: string;
  now?: () => Date;
  leaseMs?: number;
};

const DEFAULT_LEASE_MS = 5 * 60_000;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function nextAttempt(now: Date, attempts: number) {
  const delaySeconds = Math.min(3600, 15 * 2 ** Math.max(0, attempts - 1));
  return new Date(now.getTime() + delaySeconds * 1000);
}

export async function insertOutboxEvent(
  executor: PlatformDbExecutor,
  input: BackgroundEventInput,
) {
  const eventId = input.id ?? crypto.randomUUID();
  const [event] = await executor
    .insert(backgroundEvents)
    .values({
      id: eventId,
      eventName: input.name,
      payload: input.data,
      dedupeKey: input.dedupeKey ?? eventId,
    })
    .onConflictDoNothing({ target: backgroundEvents.dedupeKey })
    .returning();

  if (event) return event;

  return executor.query.backgroundEvents.findFirst({
    where: eq(backgroundEvents.dedupeKey, input.dedupeKey ?? eventId),
  });
}

export function createOutboxPublisher(deps: OutboxPublisherDeps) {
  const publisherId = deps.publisherId ?? `outbox-${crypto.randomUUID()}`;
  const currentTime = () => deps.now?.() ?? new Date();
  const leaseMs = deps.leaseMs ?? DEFAULT_LEASE_MS;

  async function publishById(outboxId: string) {
    const now = currentTime();
    const staleBefore = new Date(now.getTime() - leaseMs);
    const [event] = await deps.db
      .update(backgroundEvents)
      .set({
        status: "publishing",
        attempts: sql`${backgroundEvents.attempts} + 1`,
        lockedAt: now,
        lockedBy: publisherId,
        updatedAt: now,
      })
      .where(and(
        eq(backgroundEvents.id, outboxId),
        or(
          eq(backgroundEvents.status, "pending"),
          and(eq(backgroundEvents.status, "failed"), lte(backgroundEvents.nextAttemptAt, now)),
          and(eq(backgroundEvents.status, "publishing"), lte(backgroundEvents.lockedAt, staleBefore)),
        ),
      ))
      .returning();

    if (!event) {
      const existing = await deps.db.query.backgroundEvents.findFirst({
        where: eq(backgroundEvents.id, outboxId),
        columns: { id: true, status: true, inngestEventId: true },
      });
      return { published: false, event: existing ?? null } as const;
    }

    try {
      const result = await deps.send({
        id: event.id,
        name: event.eventName,
        data: event.payload,
      });
      const finishedAt = currentTime();
      const [published] = await deps.db
        .update(backgroundEvents)
        .set({
          status: "published",
          publishedAt: finishedAt,
          inngestEventId: result.ids[0] ?? event.id,
          lastError: null,
          lockedAt: null,
          lockedBy: null,
          updatedAt: finishedAt,
        })
        .where(and(eq(backgroundEvents.id, event.id), eq(backgroundEvents.lockedBy, publisherId)))
        .returning();

      return { published: true, event: published ?? event } as const;
    } catch (error) {
      const failedAt = currentTime();
      await deps.db
        .update(backgroundEvents)
        .set({
          status: "failed",
          nextAttemptAt: nextAttempt(failedAt, event.attempts),
          lastError: errorMessage(error),
          lockedAt: null,
          lockedBy: null,
          updatedAt: failedAt,
        })
        .where(and(eq(backgroundEvents.id, event.id), eq(backgroundEvents.lockedBy, publisherId)));
      throw error;
    }
  }

  async function publishPending(limit = 50) {
    const now = currentTime();
    const staleBefore = new Date(now.getTime() - leaseMs);
    const candidates = await deps.db
      .select({ id: backgroundEvents.id })
      .from(backgroundEvents)
      .where(or(
        eq(backgroundEvents.status, "pending"),
        and(eq(backgroundEvents.status, "failed"), lte(backgroundEvents.nextAttemptAt, now)),
        and(eq(backgroundEvents.status, "publishing"), lte(backgroundEvents.lockedAt, staleBefore)),
      ))
      .orderBy(asc(backgroundEvents.nextAttemptAt))
      .limit(Math.min(Math.max(limit, 1), 200));

    let published = 0;
    let failed = 0;
    for (const candidate of candidates) {
      try {
        const result = await publishById(candidate.id);
        if (result.published) published += 1;
      } catch {
        failed += 1;
      }
    }
    return { checked: candidates.length, published, failed };
  }

  async function redrive(outboxId: string) {
    const now = currentTime();
    await deps.db
      .update(backgroundEvents)
      .set({ status: "pending", nextAttemptAt: now, lastError: null, lockedAt: null, lockedBy: null, updatedAt: now })
      .where(and(eq(backgroundEvents.id, outboxId), inArray(backgroundEvents.status, ["failed", "pending"])));
    return publishById(outboxId);
  }

  async function cleanupPublished(retentionDays = 30) {
    const cutoff = new Date(currentTime().getTime() - retentionDays * 24 * 60 * 60_000);
    const deleted = await deps.db
      .delete(backgroundEvents)
      .where(and(eq(backgroundEvents.status, "published"), lte(backgroundEvents.publishedAt, cutoff)))
      .returning({ id: backgroundEvents.id });
    return { deleted: deleted.length };
  }

  return { publishById, publishPending, redrive, cleanupPublished };
}
