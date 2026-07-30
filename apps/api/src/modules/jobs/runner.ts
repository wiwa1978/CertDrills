import { and, asc, eq, lte } from "drizzle-orm";

import { jobs, jobRuns } from "@platform/platform-db";

type JobHandler = () => Promise<unknown>;

export type RegisteredJob = {
  name: string;
  intervalSeconds: number;
  handler: JobHandler;
};

type JobsRunnerDeps = {
  db: any;
  jobs: RegisteredJob[];
  runnerId?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function createJobsRunner(deps: JobsRunnerDeps) {
  const runnerId = deps.runnerId ?? `api-${crypto.randomUUID()}`;
  const registered = new Map(deps.jobs.map((job) => [job.name, job]));

  async function ensureRegistered() {
    const now = new Date();
    for (const job of deps.jobs) {
      await deps.db
        .insert(jobs)
        .values({ name: job.name, intervalSeconds: job.intervalSeconds, nextRunAt: now })
        .onConflictDoUpdate({
          target: jobs.name,
          set: { intervalSeconds: job.intervalSeconds, updatedAt: now },
        });
    }
  }

  async function runDue(limit = 10) {
    await ensureRegistered();
    const due = await deps.db
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, "idle"), lte(jobs.nextRunAt, new Date())))
      .orderBy(asc(jobs.nextRunAt))
      .limit(limit);

    const results = [];
    for (const row of due) {
      const job = registered.get(row.name);
      if (!job) continue;

      const [claimed] = await deps.db
        .update(jobs)
        .set({ status: "running", lockedAt: new Date(), lockedBy: runnerId, updatedAt: new Date() })
        .where(and(eq(jobs.id, row.id), eq(jobs.status, "idle")))
        .returning();
      if (!claimed) continue;

      const startedAt = new Date();
      try {
        const result = await job.handler();
        const finishedAt = new Date();
        await deps.db.insert(jobRuns).values({
          jobId: row.id,
          jobName: row.name,
          status: "success",
          startedAt,
          finishedAt,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          result,
        });
        await deps.db.update(jobs).set({
          status: "idle",
          lockedAt: null,
          lockedBy: null,
          lastRunAt: finishedAt,
          lastSuccessAt: finishedAt,
          lastError: null,
          nextRunAt: new Date(finishedAt.getTime() + job.intervalSeconds * 1000),
          updatedAt: finishedAt,
        }).where(eq(jobs.id, row.id));
        results.push({ name: row.name, status: "success" as const, result });
      } catch (error) {
        const finishedAt = new Date();
        const message = errorMessage(error);
        await deps.db.insert(jobRuns).values({
          jobId: row.id,
          jobName: row.name,
          status: "failed",
          startedAt,
          finishedAt,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          error: message,
        });
        await deps.db.update(jobs).set({
          status: "idle",
          lockedAt: null,
          lockedBy: null,
          lastRunAt: finishedAt,
          lastFailureAt: finishedAt,
          lastError: message,
          nextRunAt: new Date(finishedAt.getTime() + Math.min(job.intervalSeconds, 300) * 1000),
          updatedAt: finishedAt,
        }).where(eq(jobs.id, row.id));
        results.push({ name: row.name, status: "failed" as const, error: message });
      }
    }

    return { checked: due.length, ran: results.length, results };
  }

  return { ensureRegistered, runDue };
}
