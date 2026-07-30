"use client";

import * as React from "react";
import { Activity, CheckCircle2, Clock3, MailWarning, TimerReset, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import type {
  AdminJob,
  AdminJobRun,
  AdminJobRunStatus,
  AdminJobRunsList,
  AdminJobsList,
  AdminJobStatus,
  AdminOperationsStats,
  AdminPendingEmail,
  AdminPendingEmailStatus,
  AdminPendingEmailsList,
} from "@platform/contracts";

type OperationsFilters = {
  jobName: string;
  jobStatus: AdminJobStatus | "";
  runJobName: string;
  runStatus: AdminJobRunStatus | "";
  emailText: string;
  emailStatus: AdminPendingEmailStatus | "";
};

type OperationsMonitorProps = {
  stats: AdminOperationsStats;
  jobs: AdminJobsList;
  runs: AdminJobRunsList;
  emails: AdminPendingEmailsList;
  filters: OperationsFilters;
  limit: number;
};

const EMPTY_FILTERS: OperationsFilters = {
  jobName: "",
  jobStatus: "",
  runJobName: "",
  runStatus: "",
  emailText: "",
  emailStatus: "",
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function statusVariant(status: AdminJobStatus | AdminJobRunStatus | AdminPendingEmailStatus) {
  if (status === "failed") return "destructive";
  if (status === "success" || status === "sent" || status === "idle") return "default";
  return "secondary";
}

function jsonPreview(value: unknown) {
  return JSON.stringify(value ?? null, null, 2);
}

export function OperationsMonitor({ stats, jobs, runs, emails, filters: activeFilters, limit }: OperationsMonitorProps) {
  const router = useRouter();
  const [filters, setFilters] = React.useState<OperationsFilters>({ ...EMPTY_FILTERS, ...activeFilters });
  const [selectedJob, setSelectedJob] = React.useState<AdminJob | null>(null);
  const [selectedRun, setSelectedRun] = React.useState<AdminJobRun | null>(null);
  const [selectedEmail, setSelectedEmail] = React.useState<AdminPendingEmail | null>(null);

  function set(key: keyof OperationsFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function buildQuery(nextFilters: OperationsFilters) {
    const query: Record<string, string> = { limit: String(limit) };
    if (nextFilters.jobName) query.jobName = nextFilters.jobName;
    if (nextFilters.jobStatus) query.jobStatus = nextFilters.jobStatus;
    if (nextFilters.runJobName) query.runJobName = nextFilters.runJobName;
    if (nextFilters.runStatus) query.runStatus = nextFilters.runStatus;
    if (nextFilters.emailText) query.emailText = nextFilters.emailText;
    if (nextFilters.emailStatus) query.emailStatus = nextFilters.emailStatus;
    return query;
  }

  function applyFilters() {
    router.push({ pathname: "/admin/operations", query: buildQuery(filters) });
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    router.push({ pathname: "/admin/operations", query: { limit: String(limit) } });
  }

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Operations</h1>
          <p className="text-muted-foreground mt-2">Monitor scheduled jobs, execution history, and queued email retries.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Jobs" value={stats.jobs.total} description={`${stats.jobs.running} running`} icon={Activity} tone="bg-slate-100 text-slate-700" />
          <MetricCard title="Failed job runs" value={stats.jobs.failedRuns} description="Recorded failures" icon={XCircle} tone="bg-red-100 text-red-700" />
          <MetricCard title="Pending emails" value={stats.emails.pending} description={`${stats.emails.failed} failed`} icon={MailWarning} tone="bg-amber-100 text-amber-700" />
          <MetricCard title="Sent retries" value={stats.emails.sent} description="Queue successes" icon={CheckCircle2} tone="bg-emerald-100 text-emerald-700" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Filter job definitions, run history, and email retry queue independently.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-3">
              <FilterGroup title="Jobs">
                <Input placeholder="Job name" value={filters.jobName} onChange={(event) => set("jobName", event.target.value)} onKeyDown={(event) => event.key === "Enter" && applyFilters()} />
                <StatusSelect value={filters.jobStatus} values={["idle", "running", "disabled"]} onChange={(value) => set("jobStatus", value)} />
              </FilterGroup>

              <FilterGroup title="Job runs">
                <Input placeholder="Run job name" value={filters.runJobName} onChange={(event) => set("runJobName", event.target.value)} onKeyDown={(event) => event.key === "Enter" && applyFilters()} />
                <StatusSelect value={filters.runStatus} values={["success", "failed"]} onChange={(value) => set("runStatus", value)} />
              </FilterGroup>

              <FilterGroup title="Email queue">
                <Input placeholder="Recipient or subject" value={filters.emailText} onChange={(event) => set("emailText", event.target.value)} onKeyDown={(event) => event.key === "Enter" && applyFilters()} />
                <StatusSelect value={filters.emailStatus} values={["pending", "sending", "sent", "failed"]} onChange={(value) => set("emailStatus", value)} />
              </FilterGroup>
            </div>

            <div className="flex gap-2">
              <Button type="button" onClick={applyFilters}>Apply filters</Button>
              <Button type="button" variant="outline" onClick={clearFilters}>Clear</Button>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="jobs">
          <TabsList>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
            <TabsTrigger value="runs">Runs</TabsTrigger>
            <TabsTrigger value="emails">Email queue</TabsTrigger>
          </TabsList>

          <TabsContent value="jobs" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Registered jobs</CardTitle>
                <CardDescription>Showing {jobs.jobs.length} of {jobs.total} jobs.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Interval</TableHead>
                        <TableHead>Next run</TableHead>
                        <TableHead>Last success</TableHead>
                        <TableHead>Last failure</TableHead>
                        <TableHead className="text-right">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.jobs.length === 0 ? (
                        <EmptyRow colSpan={7} message="No jobs match the current filters." />
                      ) : jobs.jobs.map((job) => (
                        <TableRow key={job.id}>
                          <TableCell className="font-mono text-xs">{job.name}</TableCell>
                          <TableCell><Badge variant={statusVariant(job.status)}>{job.status}</Badge></TableCell>
                          <TableCell>{job.intervalSeconds}s</TableCell>
                          <TableCell>{formatDate(job.nextRunAt)}</TableCell>
                          <TableCell>{formatDate(job.lastSuccessAt)}</TableCell>
                          <TableCell>{formatDate(job.lastFailureAt)}</TableCell>
                          <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setSelectedJob(job)}>View</Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="runs" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Job run history</CardTitle>
                <CardDescription>Showing {runs.runs.length} of {runs.total} recorded runs.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Started</TableHead>
                        <TableHead>Job</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Error</TableHead>
                        <TableHead className="text-right">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.runs.length === 0 ? (
                        <EmptyRow colSpan={6} message="No job runs match the current filters." />
                      ) : runs.runs.map((run) => (
                        <TableRow key={run.id}>
                          <TableCell>{formatDate(run.startedAt)}</TableCell>
                          <TableCell className="font-mono text-xs">{run.jobName}</TableCell>
                          <TableCell><Badge variant={statusVariant(run.status)}>{run.status}</Badge></TableCell>
                          <TableCell>{run.durationMs}ms</TableCell>
                          <TableCell className="max-w-72 truncate" title={run.error ?? undefined}>{run.error ?? "-"}</TableCell>
                          <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setSelectedRun(run)}>View</Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="emails" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Email retry queue</CardTitle>
                <CardDescription>Showing {emails.emails.length} of {emails.total} queued email records.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Created</TableHead>
                        <TableHead>To</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Attempts</TableHead>
                        <TableHead>Next attempt</TableHead>
                        <TableHead>Error</TableHead>
                        <TableHead className="text-right">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emails.emails.length === 0 ? (
                        <EmptyRow colSpan={8} message="No queued emails match the current filters." />
                      ) : emails.emails.map((email) => (
                        <TableRow key={email.id}>
                          <TableCell>{formatDate(email.createdAt)}</TableCell>
                          <TableCell className="max-w-56 truncate" title={email.to}>{email.to}</TableCell>
                          <TableCell className="max-w-72 truncate" title={email.subject}>{email.subject}</TableCell>
                          <TableCell><Badge variant={statusVariant(email.status)}>{email.status}</Badge></TableCell>
                          <TableCell>{email.attempts}/{email.maxAttempts}</TableCell>
                          <TableCell>{formatDate(email.nextAttemptAt)}</TableCell>
                          <TableCell className="max-w-72 truncate" title={email.lastError ?? undefined}>{email.lastError ?? "-"}</TableCell>
                          <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setSelectedEmail(email)}>View</Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <DetailsDialog title="Job details" description={selectedJob?.name ?? ""} value={selectedJob} onClose={() => setSelectedJob(null)} />
      <DetailsDialog title="Job run details" description={selectedRun?.jobName ?? ""} value={selectedRun} onClose={() => setSelectedRun(null)} />
      <DetailsDialog title="Queued email details" description={selectedEmail?.subject ?? ""} value={selectedEmail} onClose={() => setSelectedEmail(null)} />
    </>
  );
}

function MetricCard({ title, value, description, icon: Icon, tone }: { title: string; value: number; description: string; icon: React.ElementType; tone: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`rounded-xl p-2 ${tone}`}><Icon className="h-5 w-5" /></div>
        <div>
          <p className="text-muted-foreground text-sm">{title}</p>
          <p className="text-2xl font-semibold">{value}</p>
          <p className="text-muted-foreground text-xs">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</Label>
      {children}
    </div>
  );
}

function StatusSelect({ value, values, onChange }: { value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <Select value={value || "all"} onValueChange={(nextValue) => onChange(nextValue === "all" ? "" : nextValue)}>
      <SelectTrigger>
        <SelectValue placeholder="Status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All statuses</SelectItem>
        {values.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-muted-foreground py-10 text-center">{message}</TableCell>
    </TableRow>
  );
}

function DetailsDialog({ title, description, value, onClose }: { title: string; description: string; value: unknown | null; onClose: () => void }) {
  return (
    <Dialog open={!!value} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[92vh] max-w-[min(98vw,72rem)] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto rounded-lg bg-muted p-4">
          <pre className="whitespace-pre-wrap break-words text-xs">{jsonPreview(value)}</pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}
