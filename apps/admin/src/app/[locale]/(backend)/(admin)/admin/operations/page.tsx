import { Container } from "@/components/ui/container";
import { OperationsMonitor } from "@/components/layout/backend/admin/operations/operations-monitor";
import {
  getAdminJobRunsServer,
  getAdminJobsServer,
  getAdminOperationsStatsServer,
  getAdminPendingEmailsServer,
} from "@/lib/api/admin.server";
import type { AdminJobRunStatus, AdminJobStatus, AdminPendingEmailStatus } from "@platform/contracts";

type OperationsFilters = {
  jobName: string;
  jobStatus: AdminJobStatus | "";
  runJobName: string;
  runStatus: AdminJobRunStatus | "";
  emailText: string;
  emailStatus: AdminPendingEmailStatus | "";
};

type AdminOperationsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function jobStatus(value: string | undefined): AdminJobStatus | undefined {
  return value === "idle" || value === "running" || value === "disabled" ? value : undefined;
}

function jobRunStatus(value: string | undefined): AdminJobRunStatus | undefined {
  return value === "success" || value === "failed" ? value : undefined;
}

function pendingEmailStatus(value: string | undefined): AdminPendingEmailStatus | undefined {
  return value === "pending" || value === "sending" || value === "sent" || value === "failed" ? value : undefined;
}

export default async function AdminOperationsPage({ searchParams }: AdminOperationsPageProps) {
  const params = (await searchParams) ?? {};
  const limit = Math.min(Math.max(Number(first(params.limit) ?? 50) || 50, 1), 100);
  const filters: OperationsFilters = {
    jobName: first(params.jobName) ?? "",
    jobStatus: jobStatus(first(params.jobStatus)) ?? "",
    runJobName: first(params.runJobName) ?? "",
    runStatus: jobRunStatus(first(params.runStatus)) ?? "",
    emailText: first(params.emailText) ?? "",
    emailStatus: pendingEmailStatus(first(params.emailStatus)) ?? "",
  };

  const [stats, jobs, runs, emails] = await Promise.all([
    getAdminOperationsStatsServer().catch(() => ({
      jobs: { total: 0, idle: 0, running: 0, disabled: 0, failedRuns: 0 },
      emails: { total: 0, pending: 0, sending: 0, sent: 0, failed: 0 },
    })),
    getAdminJobsServer({ limit, name: filters.jobName, status: jobStatus(filters.jobStatus) }).catch(() => ({ jobs: [], total: 0 })),
    getAdminJobRunsServer({ limit, jobName: filters.runJobName, status: jobRunStatus(filters.runStatus) }).catch(() => ({ runs: [], total: 0 })),
    getAdminPendingEmailsServer({ limit, text: filters.emailText, status: pendingEmailStatus(filters.emailStatus) }).catch(() => ({ emails: [], total: 0 })),
  ]);

  return (
    <Container className="py-6">
      <OperationsMonitor stats={stats} jobs={jobs} runs={runs} emails={emails} filters={filters} limit={limit} />
    </Container>
  );
}
