import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { createdAt, id, updatedAt } from "./helpers";

export type JobStatus = "idle" | "running" | "disabled";
export type JobRunStatus = "success" | "failed";

export const jobs = pgTable(
  "jobs",
  {
    id,
    name: text("name").notNull(),
    status: text("status").$type<JobStatus>().default("idle").notNull(),
    intervalSeconds: integer("interval_seconds").notNull(),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
    lastError: text("last_error"),
    metadata: jsonb("metadata"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("jobs_name_idx").on(table.name),
    index("jobs_status_next_run_idx").on(table.status, table.nextRunAt),
  ],
);

export const jobRuns = pgTable(
  "job_runs",
  {
    id,
    jobId: text("job_id").notNull(),
    jobName: text("job_name").notNull(),
    status: text("status").$type<JobRunStatus>().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    result: jsonb("result"),
    error: text("error"),
    createdAt,
  },
  (table) => [
    index("job_runs_job_name_started_idx").on(table.jobName, table.startedAt),
    index("job_runs_status_started_idx").on(table.status, table.startedAt),
  ],
);
