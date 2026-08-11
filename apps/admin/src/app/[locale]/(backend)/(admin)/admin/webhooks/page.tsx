import { Container } from "@/components/ui/container";
import { WebhookEventsMonitor } from "@/components/layout/backend/admin/webhooks/webhook-events-monitor";
import { getAdminWebhookEventsServer, getAdminWebhookStatsServer } from "@/lib/api/admin.server";
import type { AdminWebhookEventStatus } from "@platform/contracts";

type AdminWebhooksPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function webhookStatus(value: string | undefined): AdminWebhookEventStatus | undefined {
  return value === "processing" || value === "processed" || value === "failed" ? value : undefined;
}

export default async function AdminWebhooksPage({ searchParams }: AdminWebhooksPageProps) {
  const params = (await searchParams) ?? {};
  const limit = Math.min(Math.max(Number(first(params.limit) ?? 100) || 100, 1), 100);
  const activeFilters = {
    text: first(params.text) ?? "",
    provider: first(params.provider) ?? "",
    status: webhookStatus(first(params.status)) ?? "",
    eventType: first(params.eventType) ?? "",
    paymentId: first(params.paymentId) ?? "",
    dateFrom: first(params.dateFrom) ?? "",
    dateTo: first(params.dateTo) ?? "",
  };

  const [events, stats] = await Promise.all([
    getAdminWebhookEventsServer({ limit, ...activeFilters, status: webhookStatus(activeFilters.status) }).catch(() => ({ events: [], total: 0 })),
    getAdminWebhookStatsServer().catch(() => ({ total: 0, processing: 0, processed: 0, failed: 0 })),
  ]);

  return (
    <Container className="py-6">
      <WebhookEventsMonitor events={events} stats={stats} limit={limit} activeFilters={activeFilters} />
    </Container>
  );
}
