import type { AdminBackgroundEventStatus, AdminEmailDeliveryStatus } from "@platform/contracts";

import { OperationsMonitor } from "@/components/layout/backend/admin/operations/operations-monitor";
import { Container } from "@/components/ui/container";
import {
  getAdminBackgroundEventsServer,
  getAdminEmailDeliveriesServer,
  getAdminOperationsStatsServer,
} from "@/lib/api/admin.server";

export type OperationsFilters = {
  eventName: string;
  eventStatus: AdminBackgroundEventStatus | "";
  emailText: string;
  emailStatus: AdminEmailDeliveryStatus | "";
};

type AdminOperationsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function eventStatus(value: string | undefined): AdminBackgroundEventStatus | undefined {
  return value === "pending" || value === "publishing" || value === "published" || value === "failed" ? value : undefined;
}

function emailStatus(value: string | undefined): AdminEmailDeliveryStatus | undefined {
  return value === "pending" || value === "sending" || value === "sent" || value === "failed" ? value : undefined;
}

export default async function AdminOperationsPage({ searchParams }: AdminOperationsPageProps) {
  const params = (await searchParams) ?? {};
  const limit = Math.min(Math.max(Number(first(params.limit) ?? 50) || 50, 1), 100);
  const filters: OperationsFilters = {
    eventName: first(params.eventName) ?? "",
    eventStatus: eventStatus(first(params.eventStatus)) ?? "",
    emailText: first(params.emailText) ?? "",
    emailStatus: emailStatus(first(params.emailStatus)) ?? "",
  };

  const [stats, events, emails] = await Promise.all([
    getAdminOperationsStatsServer().catch(() => ({
      events: { total: 0, pending: 0, publishing: 0, published: 0, failed: 0 },
      emails: { total: 0, pending: 0, sending: 0, sent: 0, failed: 0 },
    })),
    getAdminBackgroundEventsServer({
      limit,
      eventName: filters.eventName || undefined,
      status: eventStatus(filters.eventStatus),
    }).catch(() => ({ events: [], total: 0 })),
    getAdminEmailDeliveriesServer({
      limit,
      text: filters.emailText || undefined,
      status: emailStatus(filters.emailStatus),
    }).catch(() => ({ emails: [], total: 0 })),
  ]);

  return (
    <Container className="py-6">
      <OperationsMonitor stats={stats} events={events} emails={emails} filters={filters} limit={limit} />
    </Container>
  );
}
