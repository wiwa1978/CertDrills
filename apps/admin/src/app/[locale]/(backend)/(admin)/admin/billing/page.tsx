import { getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { CreditsDashboard } from "@/components/layout/backend/admin/billing/credits-dashboard";
import { SubscriptionFinanceDashboard } from "@/components/layout/backend/admin/billing/subscription-finance-dashboard";
import { AdminBillingTabs, type AdminBillingSection } from "@/components/layout/backend/admin/billing/admin-billing-tabs";
import { DiscountsSection } from "@/components/layout/backend/admin/billing/discounts-section";
import { VouchersSection } from "@/components/layout/backend/admin/billing/vouchers-section";
import { getMyApplicationConfigServer } from "@/lib/api/me.server";
import {
  getAdminBillingSubscriptionFinanceDashboardServer,
  type AdminSubscriptionFinanceDashboardQuery,
  getAdminCreditsDashboardServer,
} from "@/lib/api/admin.server";

type AdminBillingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function billingSection(value: string | undefined): AdminBillingSection {
  if (value === "discounts" || value === "vouchers") {
    return value;
  }

  return "overview";
}

export default async function AdminBillingPage({ searchParams }: AdminBillingPageProps) {
  const applicationConfig = await getMyApplicationConfigServer();

  if (!applicationConfig.billing.enabled) {
    return null;
  }

  const params = (await searchParams) ?? {};
  const activeSection = billingSection(first(params.section));

  if (applicationConfig.billing.mode === "subscriptions" && applicationConfig.billing.subscriptionSurfacesEnabled && activeSection === "overview") {
    return (
      <Container className="py-6">
        <AdminSubscriptionBillingPage searchParams={params} />
      </Container>
    );
  }

  if (applicationConfig.billing.mode === "credits" && applicationConfig.billing.creditSurfacesEnabled && activeSection === "overview") {
    const dashboard = await getAdminCreditsDashboardServer();
    return (
      <Container className="py-6">
        <CreditsDashboard initialDashboard={dashboard} />
      </Container>
    );
  }

  const t = await getTranslations("admin.billing");

  return (
    <Container className="py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground mt-2">{t("description")}</p>
      </div>

      <AdminBillingTabs activeSection={activeSection}>
        {activeSection === "discounts" ? (
          <DiscountsSection />
        ) : activeSection === "vouchers" ? (
          <VouchersSection />
        ) : (
          <AdminBillingOverview applicationConfig={applicationConfig} searchParams={params} />
        )}
      </AdminBillingTabs>
    </Container>
  );
}

async function AdminBillingOverview({
  applicationConfig,
  searchParams,
}: {
  applicationConfig: Awaited<ReturnType<typeof getMyApplicationConfigServer>>;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  if (applicationConfig.billing.mode === "subscriptions" && applicationConfig.billing.subscriptionSurfacesEnabled) {
    return <AdminSubscriptionBillingPage searchParams={searchParams} />;
  }

  if (!applicationConfig.billing.creditSurfacesEnabled) {
    return null;
  }

  const dashboard = await getAdminCreditsDashboardServer();
  return <CreditsDashboard initialDashboard={dashboard} />;
}

async function AdminSubscriptionBillingPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const financeDashboard = await getAdminBillingSubscriptionFinanceDashboardServer(financeQuery(searchParams));

  return (
    <SubscriptionFinanceDashboard dashboard={financeDashboard} />
  );
}

function financeQuery(params: Record<string, string | string[] | undefined>): AdminSubscriptionFinanceDashboardQuery {
  return {
    range: rangeParam(first(params.range)),
    startDate: first(params.startDate),
    endDate: first(params.endDate),
    grouping: groupingParam(first(params.grouping)),
    currency: first(params.currency),
    planKey: first(params.planKey),
    status: statusParam(first(params.status)),
    search: first(params.search),
    subscriptionsPage: numberParam(first(params.subscriptionsPage)),
    subscriptionsSearch: first(params.subscriptionsSearch),
  };
}

function rangeParam(value: string | undefined) {
  return value === "7d" || value === "30d" || value === "90d" || value === "12m" || value === "ytd" ? value : undefined;
}

function groupingParam(value: string | undefined) {
  return value === "day" || value === "week" || value === "month" || value === "year" ? value : undefined;
}

function statusParam(value: string | undefined) {
  return value === "active" || value === "trialing" || value === "past_due" || value === "canceled" || value === "expired" || value === "paused" ? value : undefined;
}

function numberParam(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
