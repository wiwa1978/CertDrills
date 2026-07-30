"use client";

import * as React from "react";
import { Activity, CheckCircle2, Clock3, XCircle } from "lucide-react";

import { useRouter } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AdminWebhookEvent, AdminWebhookEventsList, AdminWebhookEventStatus, AdminWebhookStats } from "@platform/contracts";

type FilterState = {
  text: string;
  provider: string;
  status: string;
  eventType: string;
  paymentId: string;
  dateFrom: string;
  dateTo: string;
};

type WebhookEventsMonitorProps = {
  events: AdminWebhookEventsList;
  stats: AdminWebhookStats;
  limit: number;
  activeFilters: FilterState;
};

const EMPTY_FILTERS: FilterState = {
  text: "",
  provider: "",
  status: "",
  eventType: "",
  paymentId: "",
  dateFrom: "",
  dateTo: "",
};

function statusVariant(status: AdminWebhookEventStatus) {
  if (status === "processed") return "default";
  if (status === "failed") return "destructive";
  return "secondary";
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function jsonPreview(value: unknown) {
  return JSON.stringify(value ?? null, null, 2);
}

export function WebhookEventsMonitor({ events, stats, limit, activeFilters }: WebhookEventsMonitorProps) {
  const router = useRouter();
  const [selectedEvent, setSelectedEvent] = React.useState<AdminWebhookEvent | null>(null);
  const [filters, setFilters] = React.useState<FilterState>({ ...EMPTY_FILTERS, ...activeFilters });

  function set(key: keyof FilterState, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function buildQuery(nextFilters: FilterState) {
    const query: Record<string, string> = { limit: String(limit) };
    if (nextFilters.text) query.text = nextFilters.text;
    if (nextFilters.provider) query.provider = nextFilters.provider;
    if (nextFilters.status) query.status = nextFilters.status;
    if (nextFilters.eventType) query.eventType = nextFilters.eventType;
    if (nextFilters.paymentId) query.paymentId = nextFilters.paymentId;
    if (nextFilters.dateFrom) query.dateFrom = nextFilters.dateFrom;
    if (nextFilters.dateTo) query.dateTo = nextFilters.dateTo;
    return query;
  }

  function applyFilters() {
    router.push({ pathname: "/admin/webhooks", query: buildQuery(filters) });
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    router.push({ pathname: "/admin/webhooks", query: { limit: String(limit) } });
  }

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Webhook events</h1>
          <p className="text-muted-foreground mt-2">Monitor payment webhook processing and inspect failures.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard title="Total events" value={stats.total} icon={Activity} tone="bg-slate-100 text-slate-700" />
          <MetricCard title="Processed" value={stats.processed} icon={CheckCircle2} tone="bg-emerald-100 text-emerald-700" />
          <MetricCard title="Failed" value={stats.failed} icon={XCircle} tone="bg-red-100 text-red-700" />
          <MetricCard title="Processing" value={stats.processing} icon={Clock3} tone="bg-amber-100 text-amber-700" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Search by provider, event type, payment id, status, or received date.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <Input
                placeholder="Search provider, event id, event type, payment id"
                value={filters.text}
                onChange={(event) => set("text", event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && applyFilters()}
              />
              <div className="w-full lg:w-44">
                <Select value={filters.status || "all"} onValueChange={(value) => set("status", value === "all" ? "" : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="processed">Processed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <FilterField label="Provider" value={filters.provider} placeholder="provider" onChange={(value) => set("provider", value)} onEnter={applyFilters} />
              <FilterField label="Event type" value={filters.eventType} placeholder="payment.succeeded" onChange={(value) => set("eventType", value)} onEnter={applyFilters} />
              <FilterField label="Payment ID" value={filters.paymentId} placeholder="pay_123" onChange={(value) => set("paymentId", value)} onEnter={applyFilters} />
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label className="mb-1 block text-xs">From</Label>
                  <Input type="date" value={filters.dateFrom} onChange={(event) => set("dateFrom", event.target.value)} />
                </div>
                <div className="flex-1">
                  <Label className="mb-1 block text-xs">To</Label>
                  <Input type="date" value={filters.dateTo} onChange={(event) => set("dateTo", event.target.value)} />
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="button" onClick={applyFilters}>Apply filters</Button>
              <Button type="button" variant="outline" onClick={clearFilters}>Clear</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Webhook events</CardTitle>
            <CardDescription>Showing {events.events.length} of {events.total} recorded webhook events.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Received</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Webhook ID</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Processed</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.events.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-muted-foreground py-10 text-center">
                        No webhook events match the current filters.
                      </TableCell>
                    </TableRow>
                  ) : events.events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="whitespace-nowrap text-sm">{formatDate(event.createdAt)}</TableCell>
                      <TableCell><Badge variant="outline">{event.provider}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{event.eventType}</TableCell>
                      <TableCell><Badge variant={statusVariant(event.processingStatus)}>{event.processingStatus}</Badge></TableCell>
                      <TableCell className="max-w-56 truncate font-mono text-xs" title={event.providerEventId}>{event.providerEventId}</TableCell>
                      <TableCell className="max-w-56 truncate font-mono text-xs" title={event.paymentId ?? undefined}>{event.paymentId ?? "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{event.durationMs === null ? "-" : `${event.durationMs}ms`}</TableCell>
                      <TableCell>{event.processedAt ? formatDate(event.processedAt) : event.failedAt ? formatDate(event.failedAt) : "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button type="button" size="sm" variant="outline" onClick={() => setSelectedEvent(event)}>View</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="flex max-h-[92vh] max-w-[min(98vw,90rem)] flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Webhook event details</DialogTitle>
            <DialogDescription>{selectedEvent?.provider} - {selectedEvent?.eventType} - {selectedEvent?.processingStatus}</DialogDescription>
          </DialogHeader>
          {selectedEvent && (
            <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
              <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                <DetailItem label="Database ID" value={selectedEvent.id} />
                <DetailItem label="Webhook ID" value={selectedEvent.providerEventId} />
                <DetailItem label="Payment ID" value={selectedEvent.paymentId} />
                <DetailItem label="Request ID" value={selectedEvent.requestId} />
                <DetailItem label="Correlation ID" value={selectedEvent.correlationId} />
                <DetailItem label="Duration" value={selectedEvent.durationMs === null ? null : `${selectedEvent.durationMs}ms`} />
                <DetailItem label="Signature time" value={selectedEvent.signatureTimestamp ? formatDate(selectedEvent.signatureTimestamp) : null} />
                <DetailItem label="Received" value={formatDate(selectedEvent.createdAt)} />
                <DetailItem label="Processed" value={selectedEvent.processedAt ? formatDate(selectedEvent.processedAt) : null} />
                <DetailItem label="Failed" value={selectedEvent.failedAt ? formatDate(selectedEvent.failedAt) : null} />
                <DetailItem label="Status" value={selectedEvent.processingStatus} />
              </div>

              <Tabs defaultValue={selectedEvent.errorDetails ? "error" : "metadata"}>
                <TabsList>
                  <TabsTrigger value="metadata">Metadata</TabsTrigger>
                  <TabsTrigger value="payload">Payload</TabsTrigger>
                  <TabsTrigger value="error">Error</TabsTrigger>
                </TabsList>
                <TabsContent value="metadata" className="mt-3">
                  <JsonPanel title="Event" value={selectedEvent} />
                </TabsContent>
                <TabsContent value="payload" className="mt-3">
                  <JsonPanel title="Sanitized payload" value={selectedEvent.sanitizedPayload} />
                </TabsContent>
                <TabsContent value="error" className="mt-3">
                  <JsonPanel title="Error" value={selectedEvent.errorDetails} />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function MetricCard({ title, value, icon: Icon, tone }: { title: string; value: number; icon: React.ElementType; tone: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`rounded-xl p-2 ${tone}`}><Icon className="h-5 w-5" /></div>
        <div>
          <p className="text-muted-foreground text-sm">{title}</p>
          <p className="text-2xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function FilterField({ label, value, placeholder, onChange, onEnter }: { label: string; value: string; placeholder: string; onChange: (value: string) => void; onEnter: () => void }) {
  return (
    <div>
      <Label className="mb-1 block text-xs">{label}</Label>
      <Input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onEnter()} />
    </div>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <pre className="max-h-[58vh] overflow-auto rounded-md bg-background p-3 text-xs leading-relaxed">{jsonPreview(value)}</pre>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="min-w-0">
      <div className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</div>
      <div className="overflow-x-auto whitespace-nowrap font-mono text-xs" title={value === null ? undefined : String(value)}>{value ?? "-"}</div>
    </div>
  );
}
