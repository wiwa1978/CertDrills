import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Users, CreditCard, Bell } from "lucide-react";

import { Container } from "@/components/ui/container";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { ClientOnly } from "@/components/client-only";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getAdminCreditsConsumedDataServer,
  getAdminDashboardStatsServer,
  getAdminRevenueDataServer,
  getAdminTransactionDataServer,
} from "@/lib/api/admin.server";
import { AdminStatsCard } from "@/components/layout/backend/admin/overview/overview-stats-card";
import { TransactionsChart } from "@/components/layout/backend/admin/transactions-chart";
import { CreditsConsumedChart } from "@/components/layout/backend/admin/credits-consumed-chart";
import { RevenueChart } from "@/components/layout/backend/admin/billing/revenue-chart";
import { Separator } from "@/components/ui/separator";
import { getMyApplicationConfigServer } from "@/lib/api/me.server";

export default async function AdminDashboardPage() {
  const [t, applicationConfig] = await Promise.all([
    getTranslations("admin"),
    getMyApplicationConfigServer(),
  ]);
  const showCreditBillingCharts = applicationConfig.billing.creditSurfacesEnabled;

  return (
    <Container className="py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground mt-2">{t("description")}</p>
      </div>

      {/* Quick Links */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
        <Link href="/admin/users">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-lg">{t("users.title")}</CardTitle>
              </div>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/admin/billing">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <CreditCard className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-lg">{t("billing.title")}</CardTitle>
              </div>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/admin/notifications">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Bell className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-lg">
                  {t("notifications.title")}
                </CardTitle>
              </div>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <Separator className="w-full mb-6" />

      {/* Statistics Cards */}
      <div className="mb-8">
        <Suspense fallback={<StatsCardsSkeleton />}>
          <AdminStatsSection />
        </Suspense>
      </div>

      {showCreditBillingCharts ? (
        <>
          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-2 mb-6">
            <Suspense fallback={<ChartSkeleton />}>
              <TransactionsChartSection />
            </Suspense>
            <Suspense fallback={<ChartSkeleton />}>
              <CreditsConsumedChartSection />
            </Suspense>
          </div>
          <div className="grid gap-6">
            <Suspense fallback={<ChartSkeleton />}>
              <RevenueChartSection />
            </Suspense>
          </div>
        </>
      ) : null}
    </Container>
  );
}

async function AdminStatsSection() {
  const stats = await getAdminDashboardStatsServer();
  return <AdminStatsCard {...stats} />;
}

async function TransactionsChartSection() {
  const [dailyData, weeklyData, monthlyData, yearlyData] = await Promise.all([
    getAdminTransactionDataServer("daily"),
    getAdminTransactionDataServer("weekly"),
    getAdminTransactionDataServer("monthly"),
    getAdminTransactionDataServer("yearly"),
  ]);
  return (
    <ClientOnly fallback={<ChartSkeleton />}>
      <TransactionsChart
        dailyData={dailyData}
        weeklyData={weeklyData}
        monthlyData={monthlyData}
        yearlyData={yearlyData}
      />
    </ClientOnly>
  );
}

async function CreditsConsumedChartSection() {
  const [dailyData, weeklyData, monthlyData, yearlyData] = await Promise.all([
    getAdminCreditsConsumedDataServer("daily"),
    getAdminCreditsConsumedDataServer("weekly"),
    getAdminCreditsConsumedDataServer("monthly"),
    getAdminCreditsConsumedDataServer("yearly"),
  ]);
  return (
    <ClientOnly fallback={<ChartSkeleton />}>
      <CreditsConsumedChart
        dailyData={dailyData}
        weeklyData={weeklyData}
        monthlyData={monthlyData}
        yearlyData={yearlyData}
      />
    </ClientOnly>
  );
}

async function RevenueChartSection() {
  const [dailyData, weeklyData, monthlyData, yearlyData] = await Promise.all([
    getAdminRevenueDataServer("daily"),
    getAdminRevenueDataServer("weekly"),
    getAdminRevenueDataServer("monthly"),
    getAdminRevenueDataServer("yearly"),
  ]);
  return (
    <ClientOnly fallback={<ChartSkeleton />}>
      <RevenueChart
        dailyData={dailyData}
        weeklyData={weeklyData}
        monthlyData={monthlyData}
        yearlyData={yearlyData}
      />
    </ClientOnly>
  );
}

function StatsCardsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-10 rounded-lg" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32 mb-2" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-75 w-full" />
      </CardContent>
    </Card>
  );
}
