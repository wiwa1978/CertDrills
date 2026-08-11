"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ColumnDef } from "@tanstack/react-table";
import { Activity, ArrowUpDown, CreditCard, DollarSign, Gauge, RefreshCcw, TrendingDown, Wallet } from "lucide-react";

import type { AdminCreditsDashboard } from "@platform/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RevenueChart } from "@/components/layout/backend/admin/billing/revenue-chart";
import { PurchaseHistoryTable } from "@/components/layout/backend/admin/shared/purchase-history-table";
import { TransactionHistoryTable } from "@/components/layout/backend/admin/shared/transaction-history-table";
import { createAdminCreditRefund, getAdminCreditsDashboard } from "@/lib/services/admin";
import type { AdminCreditsDashboardQuery } from "@/lib/api/admin";
import { formatDateTime } from "@/lib/utils";

type CreditPurchase = AdminCreditsDashboard["refundablePurchases"][number];

type CreditsDashboardProps = {
  initialDashboard: AdminCreditsDashboard;
};

const PAGE_SIZE = 20;

function formatCredits(value: number | string | null | undefined) {
  return Number(value ?? 0).toFixed(2);
}

function formatMoney(cents: number | string | null | undefined, currency = "EUR") {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(Number(cents ?? 0) / 100);
}

function dashboardQuery(query: AdminCreditsDashboardQuery) {
  return ["admin-billing-credits-dashboard", query] as const;
}

export function CreditsDashboard({ initialDashboard }: CreditsDashboardProps) {
  const t = useTranslations("admin.billing.creditsDashboard");
  const statsT = useTranslations("admin.billing.stats");
  const queryClient = useQueryClient();
  const [query, setQuery] = React.useState<AdminCreditsDashboardQuery>({});
  const [refundSearch, setRefundSearch] = React.useState("");
  const [selectedPurchase, setSelectedPurchase] = React.useState<CreditPurchase | null>(null);
  const [refundReason, setRefundReason] = React.useState("");
  const [adminSecret, setAdminSecret] = React.useState("");

  const dashboard = useQuery({
    queryKey: dashboardQuery(query),
    queryFn: () => getAdminCreditsDashboard(query),
    initialData: Object.keys(query).length === 0 ? initialDashboard : undefined,
  });
  const data = dashboard.data ?? initialDashboard;

  const refundMutation = useMutation({
    mutationFn: () => {
      if (!selectedPurchase?.paymentId) {
        throw new Error(t("refund.missingPayment"));
      }

      return createAdminCreditRefund({
        paymentId: selectedPurchase.paymentId,
        reason: refundReason.trim() || undefined,
        secret: adminSecret.trim(),
      });
    },
    onSuccess: async () => {
      toast.success(t("refund.success"));
      setSelectedPurchase(null);
      setRefundReason("");
      setAdminSecret("");
      await queryClient.invalidateQueries({ queryKey: ["admin-billing-credits-dashboard"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("refund.error"));
    },
  });

  const totalAvailableCredits = Number(data.stats.totalCreditsPurchased) - Number(data.stats.totalCreditsConsumed);
  const refundAndAdjustmentTransactions = data.transactions.filter((transaction) => transaction.type === "refund" || transaction.type === "admin_adjustment");

  const statCards = [
    {
      title: statsT("totalCreditsPurchased"),
      value: formatCredits(data.stats.totalCreditsPurchased),
      description: t("stats.receivedBreakdown", {
        purchased: formatCredits(data.stats.purchasedCredits),
        bonus: formatCredits(data.stats.purchaseBonusCredits),
        vouchers: formatCredits(data.stats.voucherCredits),
        adjustments: formatCredits(data.stats.adminAdjustmentCredits),
      }),
    },
    {
      title: statsT("totalAvailableCredits"),
      value: formatCredits(totalAvailableCredits),
      description: statsT("totalAvailableCreditsDescription"),
    },
    {
      title: statsT("totalCreditsConsumed"),
      value: formatCredits(data.stats.totalCreditsConsumed),
      description: statsT("totalCreditsConsumedDescription"),
    },
    {
      title: statsT("totalRevenue"),
      value: new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" }).format(data.stats.totalRevenue),
      description: statsT("totalRevenueDescription", { count: Number(data.stats.totalPurchases).toFixed(0) }),
    },
  ];

  const refundColumns: ColumnDef<CreditPurchase>[] = [
    {
      accessorKey: "userEmail",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          {t("refund.table.user")}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.userName || t("unknownUser")}</span>
          <span className="text-xs text-muted-foreground">{row.original.userEmail}</span>
        </div>
      ),
    },
    { accessorKey: "packageKey", header: t("refund.table.package") },
    {
      accessorKey: "priceInclVat",
      header: t("refund.table.amount"),
      cell: ({ row }) => formatMoney(row.original.priceInclVat, row.original.currency ?? "EUR"),
    },
    {
      accessorKey: "paymentId",
      header: t("refund.table.payment"),
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.paymentId}</span>,
    },
    {
      accessorKey: "createdAt",
      header: t("refund.table.date"),
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
    {
      id: "actions",
      header: t("refund.table.actions"),
      cell: ({ row }) => (
        <Button size="sm" variant="outline" onClick={() => setSelectedPurchase(row.original)}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          {t("refund.action")}
        </Button>
      ),
    },
  ];

  function submitRefundSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery((current) => ({
      ...current,
      creditsRefundsPage: 1,
      creditsRefundsSearch: refundSearch.trim() || undefined,
    }));
  }

  function setPage(type: "purchases" | "refunds", page: number) {
    setQuery((current) => ({
      ...current,
      [type === "purchases" ? "creditsPurchasesPage" : "creditsRefundsPage"]: page,
    }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("description")}</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1">
          <TabsTrigger value="overview"><Gauge className="size-4" /> {t("tabs.overview")}</TabsTrigger>
          <TabsTrigger value="revenue"><DollarSign className="size-4" /> {t("tabs.revenue")}</TabsTrigger>
          <TabsTrigger value="purchases"><CreditCard className="size-4" /> {t("tabs.purchases")}</TabsTrigger>
          <TabsTrigger value="ledger"><Wallet className="size-4" /> {t("tabs.ledger")}</TabsTrigger>
          <TabsTrigger value="consumption"><TrendingDown className="size-4" /> {t("tabs.consumption")}</TabsTrigger>
          <TabsTrigger value="activity"><Activity className="size-4" /> {t("tabs.activity")}</TabsTrigger>
          <TabsTrigger value="refunds"><RefreshCcw className="size-4" /> {t("tabs.refunds")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <StatsGrid statCards={statCards} />
          <div className="grid gap-6 xl:grid-cols-2">
            <RevenueChart dailyData={data.revenue.dailyData} weeklyData={data.revenue.weeklyData} monthlyData={data.revenue.monthlyData} yearlyData={data.revenue.yearlyData} />
            <CreditsConsumedChart dailyData={data.consumption.dailyData} weeklyData={data.consumption.weeklyData} monthlyData={data.consumption.monthlyData} yearlyData={data.consumption.yearlyData} />
          </div>
        </TabsContent>

        <TabsContent value="revenue">
          <RevenueChart dailyData={data.revenue.dailyData} weeklyData={data.revenue.weeklyData} monthlyData={data.revenue.monthlyData} yearlyData={data.revenue.yearlyData} />
        </TabsContent>

        <TabsContent value="purchases">
          <PurchaseHistoryTable
            purchases={data.purchases}
            total={data.pagination.purchases.totalItems}
            loading={dashboard.isFetching}
            description={t("purchases.description")}
            onSearchPageChange={(state) => {
              setQuery((current) => ({
                ...current,
                creditsPurchasesPage: Math.floor(state.offset / PAGE_SIZE) + 1,
                creditsPurchasesSearch: state.searchEmail,
              }));
            }}
          />
        </TabsContent>

        <TabsContent value="ledger">
          <TransactionHistoryTable transactions={data.transactions} total={data.transactions.length} description={t("transactionsDescription")} />
        </TabsContent>

        <TabsContent value="consumption">
          <CreditsConsumedChart dailyData={data.consumption.dailyData} weeklyData={data.consumption.weeklyData} monthlyData={data.consumption.monthlyData} yearlyData={data.consumption.yearlyData} />
        </TabsContent>

        <TabsContent value="activity">
          <CreditsActivityChart dailyData={data.activity.dailyData} weeklyData={data.activity.weeklyData} monthlyData={data.activity.monthlyData} yearlyData={data.activity.yearlyData} />
        </TabsContent>

        <TabsContent value="refunds" className="space-y-6">
          <StatsGrid
            statCards={[
              { title: t("refund.refundablePurchases"), value: String(data.refundablePurchases.length), description: t("refund.refundablePurchasesDescription") },
              { title: t("refund.refundCredits"), value: formatCredits(data.stats.refundCredits), description: t("refund.refundCreditsDescription") },
              { title: t("refund.adminAdjustments"), value: formatCredits(data.stats.adminAdjustmentCredits), description: t("refund.adminAdjustmentsDescription") },
              { title: t("refund.refundedPurchases"), value: String(data.refundedPurchases.length), description: t("refund.refundedPurchasesDescription") },
            ]}
          />
          <Card>
            <CardHeader>
              <CardTitle>{t("refund.title")}</CardTitle>
              <CardDescription>{t("refund.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form className="flex gap-2" onSubmit={submitRefundSearch}>
                <Input value={refundSearch} onChange={(event) => setRefundSearch(event.target.value)} placeholder={t("searchPlaceholder")} />
                <Button type="submit">{t("search")}</Button>
              </form>
              <DataTable columns={refundColumns} data={data.refundablePurchases} loading={dashboard.isFetching} emptyText={t("refund.empty")} />
              <PaginationControls page={data.pagination.refunds.page} totalPages={data.pagination.refunds.totalPages} onPageChange={(page) => setPage("refunds", page)} />
            </CardContent>
          </Card>
          <TransactionHistoryTable transactions={refundAndAdjustmentTransactions} total={refundAndAdjustmentTransactions.length} description={t("refund.ledgerDescription")} />
          <PurchaseHistoryTable purchases={data.refundedPurchases} total={data.refundedPurchases.length} description={t("refund.refundedPurchasesDescription")} />
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(selectedPurchase)} onOpenChange={(open) => !open && setSelectedPurchase(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("refund.dialog.title")}</DialogTitle>
            <DialogDescription>{t("refund.dialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium">{selectedPurchase?.userEmail}</div>
              <div className="text-muted-foreground">{selectedPurchase?.paymentId}</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-reason">{t("refund.dialog.reason")}</Label>
              <Textarea id="refund-reason" value={refundReason} onChange={(event) => setRefundReason(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-secret">{t("refund.dialog.secret")}</Label>
              <Input id="refund-secret" type="password" value={adminSecret} onChange={(event) => setAdminSecret(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedPurchase(null)}>{t("refund.dialog.cancel")}</Button>
            <Button disabled={!adminSecret.trim() || refundMutation.isPending} onClick={() => refundMutation.mutate()}>
              {refundMutation.isPending ? t("refund.dialog.submitting") : t("refund.dialog.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatsGrid({ statCards }: { statCards: Array<{ title: string; value: string; description?: string }> }) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {statCards.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="space-y-2">
            <CardDescription>{stat.title}</CardDescription>
            <CardTitle className="text-2xl">{stat.value}</CardTitle>
          </CardHeader>
          {stat.description ? (
            <CardContent>
              <p className="text-sm text-muted-foreground">{stat.description}</p>
            </CardContent>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

type ConsumedPoint = { period: string; consumed: number };
type ActivityPoint = { period: string; count: number };

function CreditsConsumedChart({ dailyData, weeklyData, monthlyData, yearlyData }: { dailyData: ConsumedPoint[]; weeklyData: ConsumedPoint[]; monthlyData: ConsumedPoint[]; yearlyData: ConsumedPoint[] }) {
  const t = useTranslations("admin.billing.creditsDashboard");
  const chartT = useTranslations("admin.billing.revenueChart");
  return (
    <SimpleChartCard
      title={t("consumptionChart.title")}
      description={t("consumptionChart.description")}
      valueKey="consumed"
      valueLabel={t("consumptionChart.label")}
      labels={{ daily: chartT("daily"), weekly: chartT("weekly"), monthly: chartT("monthly"), yearly: chartT("yearly") }}
      dailyData={dailyData}
      weeklyData={weeklyData}
      monthlyData={monthlyData}
      yearlyData={yearlyData}
    />
  );
}

function CreditsActivityChart({ dailyData, weeklyData, monthlyData, yearlyData }: { dailyData: ActivityPoint[]; weeklyData: ActivityPoint[]; monthlyData: ActivityPoint[]; yearlyData: ActivityPoint[] }) {
  const t = useTranslations("admin.billing.creditsDashboard");
  const chartT = useTranslations("admin.billing.revenueChart");
  return (
    <SimpleChartCard
      title={t("activityChart.title")}
      description={t("activityChart.description")}
      valueKey="count"
      valueLabel={t("activityChart.label")}
      labels={{ daily: chartT("daily"), weekly: chartT("weekly"), monthly: chartT("monthly"), yearly: chartT("yearly") }}
      dailyData={dailyData}
      weeklyData={weeklyData}
      monthlyData={monthlyData}
      yearlyData={yearlyData}
    />
  );
}

function SimpleChartCard<T extends Record<string, string | number>>({
  title,
  description,
  valueKey,
  valueLabel,
  labels,
  dailyData,
  weeklyData,
  monthlyData,
  yearlyData,
}: {
  title: string;
  description: string;
  valueKey: keyof T & string;
  valueLabel: string;
  labels: { daily: string; weekly: string; monthly: string; yearly: string };
  dailyData: T[];
  weeklyData: T[];
  monthlyData: T[];
  yearlyData: T[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="daily" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="daily">{labels.daily}</TabsTrigger>
            <TabsTrigger value="weekly">{labels.weekly}</TabsTrigger>
            <TabsTrigger value="monthly">{labels.monthly}</TabsTrigger>
            <TabsTrigger value="yearly">{labels.yearly}</TabsTrigger>
          </TabsList>
          <TabsContent value="daily" className="mt-6"><SimpleLineChart data={dailyData} valueKey={valueKey} valueLabel={valueLabel} /></TabsContent>
          <TabsContent value="weekly" className="mt-6"><SimpleLineChart data={weeklyData} valueKey={valueKey} valueLabel={valueLabel} /></TabsContent>
          <TabsContent value="monthly" className="mt-6"><SimpleLineChart data={monthlyData} valueKey={valueKey} valueLabel={valueLabel} /></TabsContent>
          <TabsContent value="yearly" className="mt-6"><SimpleLineChart data={yearlyData} valueKey={valueKey} valueLabel={valueLabel} /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function SimpleLineChart<T extends Record<string, string | number>>({ data, valueKey, valueLabel }: { data: T[]; valueKey: keyof T & string; valueLabel: string }) {
  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
          <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} domain={[0, "auto"]} />
          <Tooltip formatter={(value) => [Number(value ?? 0).toFixed(2), valueLabel]} />
          <Line type="monotone" dataKey={valueKey} name={valueLabel} stroke="#3b82f6" strokeWidth={2.5} dot={{ fill: "white", stroke: "#3b82f6", strokeWidth: 2, r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function PaginationControls({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (page: number) => void }) {
  const t = useTranslations("admin.billing.creditsDashboard.pagination");

  return (
    <div className="flex items-center justify-end gap-2">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        {t("previous")}
      </Button>
      <span className="text-sm text-muted-foreground">{t("page", { current: page, total: totalPages })}</span>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        {t("next")}
      </Button>
    </div>
  );
}
