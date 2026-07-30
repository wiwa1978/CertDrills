"use client";

import * as React from "react";
import { AlertTriangle, Banknote, Boxes, CreditCard, Percent, RefreshCcw, Repeat, Scale, TrendingUp, Users } from "lucide-react";
import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { AdminSubscriptionFinanceDashboard } from "@platform/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/utils";

type Dashboard = AdminSubscriptionFinanceDashboard;

function money(value: number, currency = "EUR") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
}

function number(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function statusVariant(status: string | null | undefined) {
  if (status === "active" || status === "trialing" || status === "completed" || status === "succeeded") return "default";
  if (status === "past_due" || status === "pending" || status === "paused") return "secondary";
  return "outline";
}

function primaryCurrency(dashboard: Dashboard) {
  return dashboard.filters.currency ?? dashboard.transactions.localPayments[0]?.currency ?? dashboard.subscriptions.rows[0]?.currency ?? "EUR";
}

export function SubscriptionFinanceDashboard({ dashboard }: { dashboard: Dashboard }) {
  const currency = primaryCurrency(dashboard);
  const [revenueMode, setRevenueMode] = React.useState<"gross" | "net">("gross");
  const [revenueDisplay, setRevenueDisplay] = React.useState<"periodic" | "cumulative">("periodic");
  const revenueSeries = revenueMode === "gross" ? dashboard.revenue.cumulativeGrossSeries : dashboard.revenue.cumulativeNetSeries;
  const periodicRevenueSeries = revenueMode === "gross" ? dashboard.revenue.grossSeries : dashboard.revenue.netSeries;
  const activeRevenueSeries = revenueDisplay === "cumulative" ? revenueSeries : periodicRevenueSeries;

  return (
    <div className="space-y-6">
      <DashboardHeader dashboard={dashboard} />
      <WarningList warnings={dashboard.warnings} />

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1">
          <TabsTrigger value="dashboard"><TrendingUp className="size-4" /> Dashboard</TabsTrigger>
          <TabsTrigger value="subscriptions"><Repeat className="size-4" /> Subscriptions</TabsTrigger>
          <TabsTrigger value="transactions"><CreditCard className="size-4" /> Payments</TabsTrigger>
          <TabsTrigger value="refunds"><RefreshCcw className="size-4" /> Refunds</TabsTrigger>
          <TabsTrigger value="accounting"><Banknote className="size-4" /> Accounting</TabsTrigger>
          <TabsTrigger value="success"><Users className="size-4" /> Success Rate</TabsTrigger>
          <TabsTrigger value="discounts"><Percent className="size-4" /> Discounts</TabsTrigger>
          <TabsTrigger value="products"><Boxes className="size-4" /> Products</TabsTrigger>
          <TabsTrigger value="disputes"><Scale className="size-4" /> Disputes</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          <OverviewSummary dashboard={dashboard} currency={currency} />
          <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Financial trend</CardTitle>
                  <CardDescription>Completed subscription income for the selected range.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <OverviewChart data={dashboard.revenue.cumulativeGrossSeries} currency={currency} />
              </CardContent>
            </Card>
            <FreshnessCard dashboard={dashboard} />
          </div>
          <PlanDistribution dashboard={dashboard} />
        </TabsContent>

        <TabsContent value="subscriptions" className="space-y-6">
          <SubscriptionSummary dashboard={dashboard} currency={currency} />
          <RevenueSummaryCard dashboard={dashboard} currency={currency} activeMetric={revenueMode} onMetricChange={setRevenueMode} />
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Subscription revenue by {dashboard.filters.grouping}</CardTitle>
                <CardDescription>
                  {revenueDisplay === "cumulative" ? "Cumulative" : "Periodic"} {revenueMode === "gross" ? "gross" : "net"} subscription revenue grouped by {dashboard.filters.grouping}.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <SegmentedToggle value={revenueDisplay} values={["periodic", "cumulative"]} onChange={setRevenueDisplay} labels={{ periodic: "Periodic", cumulative: "Cumulative" }} />
                <GroupingLinks dashboard={dashboard} />
              </div>
            </CardHeader>
            <CardContent>
              <AmountAreaChart data={activeRevenueSeries} currency={currency} />
            </CardContent>
          </Card>
          <SubscriptionsTable rows={dashboard.subscriptions.rows} currency={currency} />
        </TabsContent>

        <TabsContent value="transactions" className="space-y-6">
          <PaymentsSummary dashboard={dashboard} currency={currency} />
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Payments by {dashboard.filters.grouping}</CardTitle>
                <CardDescription>Payment attempts grouped by {dashboard.filters.grouping} for the selected range.</CardDescription>
              </div>
              <GroupingLinks dashboard={dashboard} />
            </CardHeader>
            <CardContent>
              <PaymentsChart countData={dashboard.transactions.paymentAttemptSeries} amountData={dashboard.transactions.paymentAmountSeries} currency={currency} />
            </CardContent>
          </Card>
          <PaymentsTable rows={dashboard.transactions.localPayments} currency={currency} />
          <ProviderOnlyPaymentsTable rows={dashboard.transactions.providerOnlyPayments} currency={currency} />
        </TabsContent>

        <TabsContent value="refunds" className="space-y-6">
          <RefundsSummary dashboard={dashboard} currency={currency} />
          <RefundsTable rows={dashboard.refunds.rows} currency={currency} />
        </TabsContent>

        <TabsContent value="accounting" className="space-y-6">
          <AccountingSummary dashboard={dashboard} currency={currency} />
          <LedgerTable rows={dashboard.accounting.ledgerRows} currency={currency} />
          <PayoutsTable rows={dashboard.payouts.rows} currency={currency} />
        </TabsContent>

        <TabsContent value="success" className="space-y-6">
          <SuccessSummary dashboard={dashboard} />
          <Card>
            <CardHeader>
              <CardTitle>Success rate by {dashboard.filters.grouping}</CardTitle>
              <CardDescription>Successful payments as a percentage of attempts.</CardDescription>
            </CardHeader>
            <CardContent>
              <SuccessRateChart data={dashboard.successRate.series} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="discounts" className="space-y-6">
          <DiscountsTable rows={dashboard.discounts.rows} />
        </TabsContent>

        <TabsContent value="products" className="space-y-6">
          <ProductsSummary dashboard={dashboard} currency={currency} />
          <ProductsTable rows={dashboard.products.rows} currency={currency} />
        </TabsContent>

        <TabsContent value="disputes" className="space-y-6">
          <DisputesSummary dashboard={dashboard} currency={currency} />
          <DisputesTable rows={dashboard.disputes.rows} currency={currency} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DashboardHeader({ dashboard }: { dashboard: Dashboard }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [startDate, setStartDate] = React.useState(dashboard.filters.startDate);
  const [endDate, setEndDate] = React.useState(dashboard.filters.endDate);

  function applyDateRange() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("startDate", startDate);
    params.set("endDate", endDate);
    params.set("range", dashboard.filters.range);
    params.set("grouping", dashboard.filters.grouping);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Financial administration</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Monitor recurring revenue, cash income, accounting movements, usage billing, discounts, and source transactions.
        </p>
      </div>
      <div className="space-y-3 rounded-xl border bg-card/70 p-3 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="finance-start-date" className="text-xs font-medium text-muted-foreground">Start date</Label>
            <Input id="finance-start-date" type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="finance-end-date" className="text-xs font-medium text-muted-foreground">End date</Label>
            <Input id="finance-end-date" type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
          <Button type="button" onClick={applyDateRange}>Apply</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Grouping: {dashboard.filters.grouping}</Badge>
          {dashboard.filters.currency ? <Badge variant="outline">Currency: {dashboard.filters.currency}</Badge> : null}
          {dashboard.filters.planKey ? <Badge variant="outline">Plan: {dashboard.filters.planKey}</Badge> : null}
        </div>
      </div>
    </div>
  );
}

function WarningList({ warnings }: { warnings: Dashboard["warnings"] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="space-y-2">
      {warnings.map((warning) => (
        <Alert key={`${warning.source}:${warning.message}`}>
          <AlertTriangle className="size-4" />
          <AlertTitle>{warning.source}</AlertTitle>
          <AlertDescription>{warning.message}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

function OverviewSummary({ dashboard, currency }: { dashboard: Dashboard; currency: string }) {
  const reconciliation = dashboard.accounting.reconciliation;
  const recurringItems = [
    { label: "ARR", value: money(dashboard.overview.annualRecurringRevenue, currency) },
    { label: "Active", value: dashboard.overview.activeSubscriptions.toString() },
    { label: "Trialing", value: dashboard.overview.trialingSubscriptions.toString() },
    { label: "Churn", value: `${dashboard.overview.churnRate.toFixed(2)}%` },
  ];
  const incomeItems = [
    { label: "Gross", value: money(dashboard.overview.grossIncome, currency) },
    { label: "Net", value: money(dashboard.overview.netIncome, currency) },
    { label: "Tax", value: money(reconciliation.tax, currency) },
    { label: "Fees", value: money(reconciliation.fees, currency) },
  ];
  const operationsItems = [
    { label: "Refunds", value: money(dashboard.overview.refunds, currency) },
    { label: "Discount uses", value: dashboard.overview.discountsUsed.toString() },
    { label: "Canceled", value: dashboard.overview.canceledSubscriptions.toString() },
    { label: "Canceling", value: dashboard.subscriptions.churn.cancelAtPeriodEnd.toString() },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <SummaryGroupCard title="Recurring revenue" description="Current subscription run rate and customer base." primaryLabel="MRR" primaryValue={money(dashboard.overview.monthlyRecurringRevenue, currency)} items={recurringItems} />
      <SummaryGroupCard title="Realized income" description="Completed payments reconciled with ledger deductions." primaryLabel="Net income" primaryValue={money(dashboard.overview.netIncome, currency)} items={incomeItems} />
      <SummaryGroupCard title="Operational signals" description="Exceptions and secondary revenue for the selected range." primaryLabel="Past due" primaryValue={dashboard.overview.pastDueSubscriptions.toString()} items={operationsItems} />
    </div>
  );
}

function SummaryGroupCard({ title, description, primaryLabel, primaryValue, items }: { title: string; description: string; primaryLabel: string; primaryValue: string; items: Array<{ label: string; value: string }> }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{primaryValue}</CardTitle>
        <div className="text-sm text-muted-foreground">{primaryLabel} - {description}</div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 text-sm">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg border bg-muted/20 p-3">
            <div className="text-muted-foreground">{item.label}</div>
            <div className="mt-1 font-semibold">{item.value}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SummaryCard({ title, value, description }: { title: string; value: string; description: string }) {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent><p className="text-sm text-muted-foreground">{description}</p></CardContent>
    </Card>
  );
}

function FreshnessCard({ dashboard }: { dashboard: Dashboard }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Data freshness</CardTitle>
        <CardDescription>Local and live Dodo data status.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between"><span>Generated</span><span>{formatDateTime(dashboard.freshness.localGeneratedAt)}</span></div>
        <div className="flex justify-between"><span>Dodo live data</span><Badge variant={dashboard.freshness.providerLiveDataAvailable ? "default" : "secondary"}>{dashboard.freshness.providerLiveDataAvailable ? "Available" : "Partial"}</Badge></div>
      </CardContent>
    </Card>
  );
}

function SubscriptionSummary({ dashboard, currency }: { dashboard: Dashboard; currency: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <SummaryCard title="Total subscriptions" value={dashboard.subscriptions.pagination.totalItems.toString()} description="Matching local subscriptions" />
      <SummaryCard title="Past due" value={dashboard.overview.pastDueSubscriptions.toString()} description="Subscriptions needing payment attention" />
      <SummaryCard title="Cancel at period end" value={dashboard.subscriptions.churn.cancelAtPeriodEnd.toString()} description="Scheduled cancellations" />
      <SummaryCard title="New MRR" value={money(dashboard.revenue.newMrrSeries.reduce((total, row) => total + row.amount, 0), currency)} description="New active subscription MRR" />
    </div>
  );
}

function RevenueSummaryCard({ dashboard, currency, activeMetric, onMetricChange }: { dashboard: Dashboard; currency: string; activeMetric: "gross" | "net"; onMetricChange: (metric: "gross" | "net") => void }) {
  const selectedMetric = activeMetric === "gross"
    ? { label: "Total Revenue", value: dashboard.overview.grossIncome, description: "Completed subscription payments" }
    : { label: "Net Revenue", value: dashboard.accounting.reconciliation.netIncome, description: "After tax, fees, refunds, and disputes" };

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-6">
          <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted text-foreground">
              <CreditCard className="size-5" />
            </div>
            <div>
              <div>{selectedMetric.label}</div>
              <div className="text-xs font-normal">{selectedMetric.description}</div>
            </div>
          </div>
          <div className="text-3xl font-bold tracking-tight">{money(selectedMetric.value, currency)}</div>
        </div>
        <SegmentedToggle value={activeMetric} values={["gross", "net"]} onChange={onMetricChange} labels={{ gross: "Total Revenue", net: "Net Revenue" }} />
      </CardContent>
    </Card>
  );
}

function PaymentsSummary({ dashboard, currency }: { dashboard: Dashboard; currency: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <SummaryCard title="Attempts" value={String(dashboard.successRate.totalAttempts)} description="Payments attempted" />
      <SummaryCard title="Successful" value={String(dashboard.successRate.successfulPayments)} description="Completed or refunded" />
      <SummaryCard title="Provider-only" value={String(dashboard.transactions.providerOnlyPayments.length)} description="Missing local payment rows" />
      <SummaryCard title="Amount" value={money(dashboard.transactions.paymentAmountSeries.reduce((total, row) => total + row.amount, 0), currency)} description="Completed amount" />
    </div>
  );
}

function RefundsSummary({ dashboard, currency }: { dashboard: Dashboard; currency: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <SummaryCard title="Provider refunds" value={String(dashboard.refunds.rows.length)} description="Refunds returned by the provider" />
      <SummaryCard title="Local refunded payments" value={String(dashboard.refunds.localRefundedPayments.length)} description="Refunded rows in local storage" />
      <SummaryCard title="Refund amount" value={money(dashboard.refunds.totalAmount, currency)} description="Provider refund amount" />
    </div>
  );
}

function AccountingSummary({ dashboard, currency }: { dashboard: Dashboard; currency: string }) {
  const row = dashboard.accounting.reconciliation;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
      <SummaryCard title="Gross" value={money(row.grossPayments, currency)} description="Ledger payments" />
      <SummaryCard title="Refunds" value={money(row.refunds, currency)} description="Ledger refunds" />
      <SummaryCard title="Disputes" value={money(row.disputes, currency)} description="Ledger disputes" />
      <SummaryCard title="Fees" value={money(row.fees, currency)} description="Provider fees" />
      <SummaryCard title="Tax" value={money(row.tax, currency)} description="Ledger tax" />
      <SummaryCard title="Payouts" value={money(row.payouts, currency)} description="Provider payouts" />
    </div>
  );
}

function SuccessSummary({ dashboard }: { dashboard: Dashboard }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <SummaryCard title="Success rate" value={`${number(dashboard.successRate.rate)}%`} description="Overall payment success" />
      <SummaryCard title="Successful" value={String(dashboard.successRate.successfulPayments)} description="Completed/refunded attempts" />
      <SummaryCard title="Failed" value={String(dashboard.successRate.failedPayments)} description="Failed attempts" />
    </div>
  );
}

function ProductsSummary({ dashboard, currency }: { dashboard: Dashboard; currency: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SummaryCard title="Products" value={String(dashboard.products.rows.length)} description="Provider products" />
      <SummaryCard title="Recurring" value={String(dashboard.products.recurringCount)} description={`Recurring products in ${currency}`} />
    </div>
  );
}

function DisputesSummary({ dashboard, currency }: { dashboard: Dashboard; currency: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <SummaryCard title="Disputes" value={String(dashboard.disputes.rows.length)} description="Provider disputes" />
      <SummaryCard title="Open" value={String(dashboard.disputes.openCount)} description="Still unresolved" />
      <SummaryCard title="Amount" value={money(dashboard.disputes.totalAmount, currency)} description="Disputed amount" />
    </div>
  );
}

function AmountAreaChart({ data, currency }: { data: Dashboard["revenue"]["grossSeries"]; currency: string }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} margin={{ left: 8, right: 16, top: 16, bottom: 8 }}>
        <defs><linearGradient id="financeAmount" x1="0" x2="0" y1="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} /></linearGradient></defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="period" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={(value) => money(Number(value), currency)} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(value) => money(Number(value), currency)} />
        <Area type="monotone" dataKey="amount" stroke="#2563eb" strokeWidth={2} fill="url(#financeAmount)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function OverviewChart({ data, currency }: { data: Dashboard["revenue"]["grossSeries"]; currency: string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ left: 8, right: 8, top: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="period" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={(value: number) => money(value, currency)} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip formatter={(value) => [money(Number(value ?? 0), currency), "Income"]} />
        <Line type="monotone" dataKey="amount" stroke="#0f766e" strokeWidth={2.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function PaymentsChart({ countData, amountData, currency }: { countData: Dashboard["transactions"]["paymentAttemptSeries"]; amountData: Dashboard["transactions"]["paymentAmountSeries"]; currency: string }) {
  const amountsByPeriod = new Map(amountData.map((point) => [point.period, point.amount]));
  const data = countData.map((point) => ({ period: point.period, payments: point.count, amount: amountsByPeriod.get(point.period) ?? 0 }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ left: 8, right: 8, top: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="period" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
        <YAxis yAxisId="count" allowDecimals={false} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
        <YAxis yAxisId="amount" orientation="right" tickFormatter={(value: number) => money(value, currency)} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip formatter={(value, name) => name === "Amount" ? [money(Number(value ?? 0), currency), name] : [Number(value ?? 0), name]} />
        <Bar yAxisId="count" dataKey="payments" name="Payments" fill="#7c3aed" radius={[4, 4, 0, 0]} />
        <Line yAxisId="amount" type="monotone" dataKey="amount" name="Amount" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function SegmentedToggle<T extends string>({ value, values, labels, onChange }: { value: T; values: T[]; labels: Record<T, string>; onChange: (value: T) => void }) {
  return (
    <div className="flex rounded-lg border bg-background p-1 shadow-sm">
      {values.map((item) => (
        <button key={item} type="button" onClick={() => onChange(item)} className={["rounded-md px-3 py-2 text-sm font-medium transition-colors", value === item ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"].join(" ")}>
          {labels[item]}
        </button>
      ))}
    </div>
  );
}

function GroupingLinks({ dashboard }: { dashboard: Dashboard }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setGrouping(grouping: "day" | "week" | "month") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("grouping", grouping);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex rounded-lg border bg-background p-1 shadow-sm">
      {(["day", "week", "month"] as const).map((grouping) => (
        <Button key={grouping} type="button" size="sm" variant={dashboard.filters.grouping === grouping ? "secondary" : "ghost"} className="capitalize" onClick={() => setGrouping(grouping)}>
          {grouping}
        </Button>
      ))}
    </div>
  );
}

function SuccessRateChart({ data }: { data: Dashboard["successRate"]["series"] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ left: 8, right: 16, top: 16, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="period" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={(value) => `${value}%`} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(value) => `${number(Number(value))}%`} />
        <Area type="monotone" dataKey="rate" stroke="#16a34a" fill="#16a34a33" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function PlanDistribution({ dashboard }: { dashboard: Dashboard }) {
  return (
    <Card>
      <CardHeader><CardTitle>Plan distribution</CardTitle><CardDescription>Subscriptions grouped by plan.</CardDescription></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        {dashboard.subscriptions.planDistribution.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subscriptions match the selected filters.</p>
        ) : dashboard.subscriptions.planDistribution.map((row) => <SummaryCard key={row.planKey} title={row.planKey} value={String(row.count)} description="subscriptions" />)}
      </CardContent>
    </Card>
  );
}

function Empty({ rows, message }: { rows: unknown[]; message: string }) {
  return rows.length === 0 ? <p className="py-6 text-sm text-muted-foreground">{message}</p> : null;
}

function SubscriptionsTable({ rows, currency }: { rows: Dashboard["subscriptions"]["rows"]; currency: string }) {
  return <BasicTable title="Subscriptions" description="Local subscription records enriched with latest payment details" rows={rows} empty="No subscriptions match the selected filters." headers={["User", "Plan", "Status", "Next billing", "Amount", "Payment", "Subscription"]} render={(row) => [userCell(row.userName, row.userEmail), row.planKey, badge(row.status), row.currentPeriodEnd ? formatDateTime(row.currentPeriodEnd) : "-", money(row.amount, row.currency || currency), row.latestPaymentId ?? "-", row.providerSubscriptionId]} />;
}

function PaymentsTable({ rows, currency }: { rows: Dashboard["transactions"]["localPayments"]; currency: string }) {
  return <BasicTable title="Local payments" description="Subscription payments stored locally" rows={rows} empty="No local payments for this range." headers={["User", "Plan", "Status", "Amount", "Payment", "Date"]} render={(row) => [userCell(row.userName, row.userEmail), row.planKey, badge(row.paymentStatus), money(row.priceInclVat / 100, row.currency || currency), row.paymentId, formatDateTime(row.createdAt)]} />;
}

function ProviderOnlyPaymentsTable({ rows, currency }: { rows: Dashboard["transactions"]["providerOnlyPayments"]; currency: string }) {
  return <BasicTable title="Provider-only payments" description="Provider payments without a matching local payment row" rows={rows} empty="No provider-only payments found." headers={["Customer", "Status", "Amount", "Payment", "Subscription", "Date"]} render={(row) => [userCell(row.customer?.name ?? null, row.customer?.email ?? undefined), badge(row.status ?? "unknown"), money((row.amount?.amount ?? 0) / 100, row.amount?.currency ?? currency), row.paymentId, row.subscriptionId ?? "-", row.createdAt ? formatDateTime(row.createdAt) : "-"]} />;
}

function RefundsTable({ rows, currency }: { rows: Dashboard["refunds"]["rows"]; currency: string }) {
  return <BasicTable title="Provider refunds" description="Refunds returned by the payment provider" rows={rows} empty="No provider refunds for this range." headers={["Refund", "Payment", "Status", "Amount", "Reason", "Date"]} render={(row) => [row.refundId, row.paymentId, badge(row.status), money((row.amount?.amount ?? 0) / 100, row.amount?.currency ?? currency), row.reason ?? "-", row.createdAt ? formatDateTime(row.createdAt) : "-"]} />;
}

function LedgerTable({ rows, currency }: { rows: Dashboard["accounting"]["ledgerRows"]; currency: string }) {
  return <BasicTable title="Accounting ledger" description="Provider ledger rows for payments, fees, tax, disputes, refunds, and payouts" rows={rows} empty="No provider ledger rows for this range." headers={["Created", "Event", "Amount", "Reference", "Description"]} render={(row) => [row.createdAt ? formatDateTime(row.createdAt) : "-", row.eventType, money((row.amount?.amount ?? 0) / 100, row.amount?.currency ?? currency), row.referenceObjectId ?? "-", row.description ?? "-"]} />;
}

function PayoutsTable({ rows, currency }: { rows: Dashboard["payouts"]["rows"]; currency: string }) {
  return <BasicTable title="Payouts" description="Provider payouts for this range" rows={rows} empty="No provider payouts for this range." headers={["Payout", "Status", "Amount", "Fee", "Tax", "Date"]} render={(row) => [row.payoutId, badge(row.status ?? "unknown"), money((row.amount?.amount ?? 0) / 100, row.amount?.currency ?? currency), money((row.fee ?? 0) / 100, currency), money((row.tax ?? 0) / 100, currency), row.createdAt ? formatDateTime(row.createdAt) : "-"]} />;
}

function DiscountsTable({ rows }: { rows: Dashboard["discounts"]["rows"] }) {
  return <BasicTable title="Discounts" description="Local discounts matched with provider discount rows" rows={rows} empty="No discounts found." headers={["Code", "Type", "Value", "Status", "Uses", "Provider"]} render={(row) => [row.code, row.type, String(row.value), badge(row.status), `${row.currentUses}/${row.maxUses ?? "∞"}`, row.providerDiscount ? "Matched" : "Local only"]} />;
}

function ProductsTable({ rows, currency }: { rows: Dashboard["products"]["rows"]; currency: string }) {
  return <BasicTable title="Products" description="Products returned by the payment provider" rows={rows} empty="No provider products available." headers={["Product", "Name", "Price", "Recurring", "Tax", "Updated"]} render={(row) => [row.productId, row.name ?? "-", money((row.price?.amount ?? 0) / 100, row.price?.currency ?? currency), row.isRecurring ? "Yes" : "No", row.taxCategory ?? "-", row.updatedAt ? formatDateTime(row.updatedAt) : "-"]} />;
}

function DisputesTable({ rows, currency }: { rows: Dashboard["disputes"]["rows"]; currency: string }) {
  return <BasicTable title="Disputes" description="Provider disputes for this range" rows={rows} empty="No provider disputes for this range." headers={["Dispute", "Payment", "Status", "Stage", "Amount", "Date"]} render={(row) => [row.disputeId, row.paymentId ?? "-", badge(row.status ?? "unknown"), row.stage ?? "-", money((row.amount?.amount ?? 0) / 100, row.amount?.currency ?? currency), row.createdAt ? formatDateTime(row.createdAt) : "-"]} />;
}

function BasicTable<T>({ title, description, rows, empty, headers, render }: { title: string; description: string; rows: T[]; empty: string; headers: string[]; render: (row: T) => React.ReactNode[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
      <CardContent className="overflow-x-auto">
        <Empty rows={rows} message={empty} />
        {rows.length > 0 ? <Table><TableHeader><TableRow>{headers.map((header) => <TableHead key={header}>{header}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((row, rowIndex) => <TableRow key={rowIndex}>{render(row).map((cell, cellIndex) => <TableCell key={cellIndex} className={typeof cell === "string" && cell.length > 18 ? "font-mono text-xs" : undefined}>{cell}</TableCell>)}</TableRow>)}</TableBody></Table> : null}
      </CardContent>
    </Card>
  );
}

function badge(value: string) {
  return <Badge variant={statusVariant(value)}>{value}</Badge>;
}

function userCell(name: string | null | undefined, email: string | undefined) {
  return <div className="flex flex-col"><span className="font-medium">{name ?? "Unknown"}</span><span className="text-xs text-muted-foreground">{email ?? "-"}</span></div>;
}
