"use client";

import * as React from "react";
import { Activity, CheckCircle2, MailWarning, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import type {
  AdminBackgroundEvent,
  AdminBackgroundEventsList,
  AdminBackgroundEventStatus,
  AdminEmailDeliveriesList,
  AdminEmailDelivery,
  AdminEmailDeliveryStatus,
  AdminOperationsStats,
} from "@platform/contracts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from "@/i18n/navigation";
import { redriveBackgroundEventApi } from "@/lib/api/admin";
import type { OperationsFilters } from "@/app/[locale]/(backend)/(admin)/admin/operations/page";

type OperationsMonitorProps = {
  stats: AdminOperationsStats;
  events: AdminBackgroundEventsList;
  emails: AdminEmailDeliveriesList;
  filters: OperationsFilters;
  limit: number;
};

const EMPTY_FILTERS: OperationsFilters = {
  eventName: "",
  eventStatus: "",
  emailText: "",
  emailStatus: "",
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function statusVariant(status: AdminBackgroundEventStatus | AdminEmailDeliveryStatus) {
  if (status === "failed") return "destructive";
  if (status === "published" || status === "sent") return "default";
  return "secondary";
}

function jsonPreview(value: unknown) {
  return JSON.stringify(value ?? null, null, 2);
}

export function OperationsMonitor({ stats, events, emails, filters: activeFilters, limit }: OperationsMonitorProps) {
  const router = useRouter();
  const [filters, setFilters] = React.useState<OperationsFilters>({ ...EMPTY_FILTERS, ...activeFilters });
  const [selectedEvent, setSelectedEvent] = React.useState<AdminBackgroundEvent | null>(null);
  const [selectedEmail, setSelectedEmail] = React.useState<AdminEmailDelivery | null>(null);
  const [redriveEvent, setRedriveEvent] = React.useState<AdminBackgroundEvent | null>(null);
  const [adminSecret, setAdminSecret] = React.useState("");
  const [redriving, setRedriving] = React.useState(false);

  function set(key: keyof OperationsFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function buildQuery(nextFilters: OperationsFilters) {
    const query: Record<string, string> = { limit: String(limit) };
    if (nextFilters.eventName) query.eventName = nextFilters.eventName;
    if (nextFilters.eventStatus) query.eventStatus = nextFilters.eventStatus;
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

  async function redrive() {
    if (!redriveEvent || !adminSecret.trim()) return;
    setRedriving(true);
    try {
      const result = await redriveBackgroundEventApi(redriveEvent.id, adminSecret.trim());
      if (!result.success) throw new Error(result.error || "Failed to redrive background event");
      toast.success("Background event was submitted to Inngest.");
      setRedriveEvent(null);
      setAdminSecret("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to redrive background event");
    } finally {
      setRedriving(false);
    }
  }

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Operations</h1>
          <p className="mt-2 text-muted-foreground">Monitor durable event publication and email delivery. Inngest owns function execution and retry history.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Background events" value={stats.events.total} description={`${stats.events.pending} pending`} icon={Activity} tone="bg-slate-100 text-slate-700" />
          <MetricCard title="Failed events" value={stats.events.failed} description={`${stats.events.publishing} publishing`} icon={RefreshCcw} tone="bg-red-100 text-red-700" />
          <MetricCard title="Pending emails" value={stats.emails.pending} description={`${stats.emails.failed} failed`} icon={MailWarning} tone="bg-amber-100 text-amber-700" />
          <MetricCard title="Sent emails" value={stats.emails.sent} description={`${stats.emails.sending} sending`} icon={CheckCircle2} tone="bg-emerald-100 text-emerald-700" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Filter background events and email deliveries independently.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <FilterGroup title="Background events">
                <Input placeholder="Event name" value={filters.eventName} onChange={(event) => set("eventName", event.target.value)} onKeyDown={(event) => event.key === "Enter" && applyFilters()} />
                <StatusSelect value={filters.eventStatus} values={["pending", "publishing", "published", "failed"]} onChange={(value) => set("eventStatus", value)} />
              </FilterGroup>
              <FilterGroup title="Email deliveries">
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

        <Tabs defaultValue="events">
          <TabsList>
            <TabsTrigger value="events">Background events</TabsTrigger>
            <TabsTrigger value="emails">Email deliveries</TabsTrigger>
          </TabsList>

          <TabsContent value="events" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Outbox events</CardTitle>
                <CardDescription>Showing {events.events.length} of {events.total} durable event records.</CardDescription>
              </CardHeader>
              <CardContent><div className="overflow-x-auto"><Table>
                <TableHeader><TableRow><TableHead>Created</TableHead><TableHead>Event</TableHead><TableHead>Status</TableHead><TableHead>Attempts</TableHead><TableHead>Published</TableHead><TableHead>Error</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {events.events.length === 0 ? <EmptyRow colSpan={7} message="No background events match the current filters." /> : events.events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>{formatDate(event.createdAt)}</TableCell>
                      <TableCell className="font-mono text-xs">{event.eventName}</TableCell>
                      <TableCell><Badge variant={statusVariant(event.status)}>{event.status}</Badge></TableCell>
                      <TableCell>{event.attempts}</TableCell>
                      <TableCell>{formatDate(event.publishedAt)}</TableCell>
                      <TableCell className="max-w-72 truncate" title={event.lastError ?? undefined}>{event.lastError ?? "-"}</TableCell>
                      <TableCell className="space-x-2 text-right">
                        <Button size="sm" variant="outline" onClick={() => setSelectedEvent(event)}>View</Button>
                        {(event.status === "failed" || event.status === "pending") && <Button size="sm" onClick={() => setRedriveEvent(event)}>Redrive</Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table></div></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="emails" className="mt-4">
            <Card>
              <CardHeader><CardTitle>Email deliveries</CardTitle><CardDescription>Showing {emails.emails.length} of {emails.total} delivery records.</CardDescription></CardHeader>
              <CardContent><div className="overflow-x-auto"><Table>
                <TableHeader><TableRow><TableHead>Created</TableHead><TableHead>To</TableHead><TableHead>Subject</TableHead><TableHead>Status</TableHead><TableHead>Attempts</TableHead><TableHead>Last attempt</TableHead><TableHead>Error</TableHead><TableHead className="text-right">Details</TableHead></TableRow></TableHeader>
                <TableBody>
                  {emails.emails.length === 0 ? <EmptyRow colSpan={8} message="No email deliveries match the current filters." /> : emails.emails.map((email) => (
                    <TableRow key={email.id}>
                      <TableCell>{formatDate(email.createdAt)}</TableCell><TableCell className="max-w-56 truncate" title={email.to}>{email.to}</TableCell><TableCell className="max-w-72 truncate" title={email.subject}>{email.subject}</TableCell><TableCell><Badge variant={statusVariant(email.status)}>{email.status}</Badge></TableCell><TableCell>{email.attempts}</TableCell><TableCell>{formatDate(email.lastAttemptAt)}</TableCell><TableCell className="max-w-72 truncate" title={email.lastError ?? undefined}>{email.lastError ?? "-"}</TableCell><TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setSelectedEmail(email)}>View</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table></div></CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <DetailsDialog title="Background event details" description={selectedEvent?.eventName ?? ""} value={selectedEvent} onClose={() => setSelectedEvent(null)} />
      <DetailsDialog title="Email delivery details" description={selectedEmail?.subject ?? ""} value={selectedEmail} onClose={() => setSelectedEmail(null)} />
      <Dialog open={!!redriveEvent} onOpenChange={(open) => !open && setRedriveEvent(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Redrive background event</DialogTitle><DialogDescription>{redriveEvent?.eventName}</DialogDescription></DialogHeader>
          <div className="space-y-2"><Label htmlFor="redrive-admin-secret">Admin secret</Label><Input id="redrive-admin-secret" type="password" value={adminSecret} onChange={(event) => setAdminSecret(event.target.value)} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setRedriveEvent(null)}>Cancel</Button><Button disabled={!adminSecret.trim() || redriving} onClick={redrive}>{redriving ? "Submitting…" : "Redrive"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MetricCard({ title, value, description, icon: Icon, tone }: { title: string; value: number; description: string; icon: React.ElementType; tone: string }) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><div className={`rounded-xl p-2 ${tone}`}><Icon className="h-5 w-5" /></div><div><p className="text-sm text-muted-foreground">{title}</p><p className="text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{description}</p></div></CardContent></Card>;
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-2 rounded-lg border p-3"><Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</Label>{children}</div>;
}

function StatusSelect({ value, values, onChange }: { value: string; values: string[]; onChange: (value: string) => void }) {
  return <Select value={value || "all"} onValueChange={(nextValue) => onChange(nextValue === "all" ? "" : nextValue)}><SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{values.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select>;
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return <TableRow><TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">{message}</TableCell></TableRow>;
}

function DetailsDialog({ title, description, value, onClose }: { title: string; description: string; value: unknown | null; onClose: () => void }) {
  return <Dialog open={!!value} onOpenChange={(open) => !open && onClose()}><DialogContent className="flex max-h-[92vh] max-w-[min(98vw,72rem)] flex-col overflow-hidden"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader><div className="min-h-0 overflow-y-auto rounded-lg bg-muted p-4"><pre className="whitespace-pre-wrap break-words text-xs">{jsonPreview(value)}</pre></div></DialogContent></Dialog>;
}
