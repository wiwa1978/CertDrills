import { and, asc, eq, lte } from "drizzle-orm";

import { pendingEmails } from "@platform/platform-db";
import type { BaseSendEmailParams, EmailProvider } from "@platform/email-core";

type EmailQueueDeps = {
  db: any;
  provider: EmailProvider;
};

const MAX_ATTEMPTS = 5;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function nextAttempt(attempts: number) {
  const delaySeconds = Math.min(3600, 30 * 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + delaySeconds * 1000);
}

export function createEmailQueue(deps: EmailQueueDeps) {
  async function sendEmailNow(params: BaseSendEmailParams) {
    return deps.provider.send(params);
  }

  async function enqueue(params: BaseSendEmailParams, error?: unknown) {
    const [row] = await deps.db
      .insert(pendingEmails)
      .values({
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text ?? null,
        status: "pending",
        attempts: 0,
        maxAttempts: MAX_ATTEMPTS,
        nextAttemptAt: nextAttempt(1),
        lastError: error ? errorMessage(error) : null,
      })
      .returning({ id: pendingEmails.id });

    return row;
  }

  async function sendEmail(params: BaseSendEmailParams) {
    const result = await sendEmailNow(params);
    if (result.success) return result;
    await enqueue(params, result.error);
    return result;
  }

  async function processPending(limit = 25) {
    const now = new Date();
    const rows = await deps.db
      .select()
      .from(pendingEmails)
      .where(and(eq(pendingEmails.status, "pending"), lte(pendingEmails.nextAttemptAt, now)))
      .orderBy(asc(pendingEmails.nextAttemptAt))
      .limit(limit);

    let sent = 0;
    let failed = 0;

    for (const row of rows) {
      const [claimed] = await deps.db
        .update(pendingEmails)
        .set({ status: "sending", updatedAt: new Date() })
        .where(and(eq(pendingEmails.id, row.id), eq(pendingEmails.status, "pending")))
        .returning({ id: pendingEmails.id });

      if (!claimed) continue;

      const result = await sendEmailNow({ to: row.to, subject: row.subject, html: row.html, text: row.text ?? undefined });
      if (result.success) {
        sent += 1;
        await deps.db
          .update(pendingEmails)
          .set({ status: "sent", sentAt: new Date(), providerMessageId: result.data?.id ?? null, updatedAt: new Date() })
          .where(eq(pendingEmails.id, row.id));
      } else {
        const attempts = row.attempts + 1;
        const terminal = attempts >= row.maxAttempts;
        failed += 1;
        await deps.db
          .update(pendingEmails)
          .set({
            status: terminal ? "failed" : "pending",
            attempts,
            nextAttemptAt: terminal ? row.nextAttemptAt : nextAttempt(attempts),
            failedAt: terminal ? new Date() : null,
            lastError: errorMessage(result.error),
            updatedAt: new Date(),
          })
          .where(eq(pendingEmails.id, row.id));
      }
    }

    return { checked: rows.length, sent, failed };
  }

  return { sendEmail, sendEmailNow, enqueue, processPending };
}
