import { and, eq, inArray, lte, ne, sql } from "drizzle-orm";

import { emailDeliveries, type PlatformDb } from "@platform/platform-db";
import type { BaseSendEmailParams, EmailProvider } from "@platform/email-core";

import { emailDeliveryRequested } from "../../inngest/events";
import { insertOutboxEvent } from "../background/outbox";

type EmailDeliveryDeps = {
  db: PlatformDb;
  provider: EmailProvider;
  publishOutbox?: (outboxId: string) => Promise<unknown>;
  now?: () => Date;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function createEmailDeliveryService(deps: EmailDeliveryDeps) {
  const currentTime = () => deps.now?.() ?? new Date();

  async function enqueue(params: BaseSendEmailParams) {
    const deliveryId = crypto.randomUUID();
    const outboxId = crypto.randomUUID();
    await deps.db.transaction(async (tx) => {
      await tx.insert(emailDeliveries).values({
        id: deliveryId,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text ?? null,
        status: "pending",
      });
      await insertOutboxEvent(tx, {
        id: outboxId,
        name: emailDeliveryRequested.name,
        data: { deliveryId },
        dedupeKey: `email-delivery:${deliveryId}`,
      });
    });

    if (deps.publishOutbox) {
      await deps.publishOutbox(outboxId).catch(() => undefined);
    }

    return { id: deliveryId, outboxId };
  }

  async function sendEmail(params: BaseSendEmailParams) {
    const delivery = await enqueue(params);
    return { success: true as const, data: { id: delivery.id } };
  }

  async function deliver(deliveryId: string) {
    const startedAt = currentTime();
    const [delivery] = await deps.db
      .update(emailDeliveries)
      .set({
        status: "sending",
        attempts: sql`${emailDeliveries.attempts} + 1`,
        lastAttemptAt: startedAt,
        lastError: null,
        updatedAt: startedAt,
      })
      .where(and(eq(emailDeliveries.id, deliveryId), ne(emailDeliveries.status, "sent")))
      .returning();

    if (!delivery) {
      const existing = await deps.db.query.emailDeliveries.findFirst({
        where: eq(emailDeliveries.id, deliveryId),
        columns: { id: true, status: true, providerMessageId: true },
      });
      if (!existing) throw new Error(`Email delivery ${deliveryId} was not found`);
      return { delivered: false, delivery: existing } as const;
    }

    let result: Awaited<ReturnType<EmailProvider["send"]>>;
    try {
      result = await deps.provider.send({
        to: delivery.to,
        subject: delivery.subject,
        html: delivery.html,
        text: delivery.text ?? undefined,
        idempotencyKey: delivery.id,
      });
    } catch (error) {
      result = { success: false, error };
    }

    const finishedAt = currentTime();
    if (!result.success) {
      const message = errorMessage(result.error);
      await deps.db
        .update(emailDeliveries)
        .set({ status: "failed", failedAt: finishedAt, lastError: message, updatedAt: finishedAt })
        .where(eq(emailDeliveries.id, delivery.id));
      throw new Error(message);
    }

    const [sent] = await deps.db
      .update(emailDeliveries)
      .set({
        status: "sent",
        sentAt: finishedAt,
        failedAt: null,
        lastError: null,
        providerMessageId: result.data?.id ?? null,
        updatedAt: finishedAt,
      })
      .where(eq(emailDeliveries.id, delivery.id))
      .returning();

    return { delivered: true, delivery: sent ?? delivery } as const;
  }

  async function cleanupCompleted(retentionDays = 30) {
    const cutoff = new Date(currentTime().getTime() - retentionDays * 24 * 60 * 60_000);
    const deleted = await deps.db
      .delete(emailDeliveries)
      .where(and(inArray(emailDeliveries.status, ["sent", "failed"]), lte(emailDeliveries.updatedAt, cutoff)))
      .returning({ id: emailDeliveries.id });
    return { deleted: deleted.length };
  }

  return { enqueue, sendEmail, deliver, cleanupCompleted };
}
