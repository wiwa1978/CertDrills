"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, RefreshCcw, Search } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { AdminTransactionFinanceDashboard } from "@platform/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/utils";
import { createAdminTransactionRefund } from "@/lib/services/admin";
import {
  buildRevenueChartData,
  buildRevenueAccessibleRows,
  buildAttemptsAccessibleRows,
  buildSuccessAccessibleRows,
  buildTransactionDashboardHref,
  deriveTransactionOrderFilterControls,
  formatMajorMoney,
  formatMinorMoney,
  formatProviderMoney,
  providerRefundStatusTranslationKey,
  transactionStatusVariant,
  warningTranslationKey,
  type TransactionFinanceDashboardSection,
  type TransactionOrderStatus,
} from "./transaction-finance-dashboard-helpers";

export {
  buildRevenueChartData,
  buildRevenueAccessibleRows,
  buildAttemptsAccessibleRows,
  buildSuccessAccessibleRows,
  buildTransactionDashboardHref,
  deriveTransactionOrderFilterControls,
  formatMajorMoney,
  formatMinorMoney,
  formatProviderMoney,
  providerRefundStatusTranslationKey,
  parseTransactionDashboardQuery,
  transactionStatusVariant,
  warningTranslationKey,
} from "./transaction-finance-dashboard-helpers";

type Dashboard = AdminTransactionFinanceDashboard;
type Order = Dashboard["orders"]["rows"][number];
type Pagination = Dashboard["orders"]["pagination"];
type Translator = ReturnType<typeof useTranslations<"admin.billing.transactionsMode">>;

const statuses: TransactionOrderStatus[] = [
  "pending_payment",
  "paid",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
];
const chartColors = ["#0f766e", "#2563eb", "#7c3aed", "#c2410c", "#be123c", "#4d7c0f"];

export function TransactionFinanceDashboard({ activeSection, dashboard }: { activeSection: TransactionFinanceDashboardSection; dashboard: Dashboard }) {
  return (
    <div className="space-y-6">
      <DashboardHeading />
      <WarningList warnings={dashboard.warnings} />
      <TransactionFinanceDashboardContent activeSection={activeSection} dashboard={dashboard} />
    </div>
  );
}

function TransactionFinanceDashboardContent({ activeSection, dashboard }: { activeSection: TransactionFinanceDashboardSection; dashboard: Dashboard }) {
  if (activeSection === "orders") return <OrdersCard key={`orders:${dashboard.orders.pagination.page}`} dashboard={dashboard} />;
  if (activeSection === "refunds") return <div className="space-y-6"><Refunds dashboard={dashboard} /></div>;
  if (activeSection === "products") return <div className="space-y-6"><Products dashboard={dashboard} /></div>;
  return <div className="space-y-6"><Overview dashboard={dashboard} /></div>;
}

function DashboardHeading() {
  const t = useTranslations("admin.billing.transactionsMode");
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">{t("description")}</p>
    </div>
  );
}

function FilterSelect({ id, label, value, onValueChange, children }: { id: string; label: string; value: string; onValueChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <div className="min-w-40 flex-1 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}

function OrdersFilters({ filters }: { filters: Dashboard["filters"] }) {
  const t = useTranslations("admin.billing.transactionsMode");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();
  const controls = deriveTransactionOrderFilterControls(filters);
  const [range, setRange] = React.useState(controls.range);
  const [startDate, setStartDate] = React.useState(controls.startDate);
  const [endDate, setEndDate] = React.useState(controls.endDate);
  const [status, setStatus] = React.useState(controls.status);
  const [search, setSearch] = React.useState(controls.search);

  function navigate(updates: Record<string, string | number | undefined>) {
    startTransition(() => router.push(buildTransactionDashboardHref(pathname, searchParams, updates)));
  }

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({
      range,
      startDate: range === "custom" ? startDate : undefined,
      endDate: range === "custom" ? endDate : undefined,
      status: status === "all" ? undefined : status,
      search: search.trim() || undefined,
      grouping: undefined,
      currency: undefined,
      productKey: undefined,
      page: 1,
    });
  }

  function clearFilters() {
    setRange("30d");
    setStartDate("");
    setEndDate("");
    setStatus("all");
    setSearch("");
    navigate({
      range: "30d",
      startDate: undefined,
      endDate: undefined,
      status: undefined,
      search: undefined,
      grouping: undefined,
      currency: undefined,
      productKey: undefined,
      page: 1,
    });
  }

  return (
    <form className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 md:flex-row md:flex-wrap md:items-end xl:flex-nowrap" onSubmit={applyFilters}>
      <FilterSelect id="transaction-range" label={t("filters.range")} value={range} onValueChange={(value) => setRange(value as Dashboard["filters"]["range"])}>
        {(["7d", "30d", "90d", "12m", "custom"] as const).map((value) => <SelectItem key={value} value={value}>{t(`ranges.${value}`)}</SelectItem>)}
      </FilterSelect>
      <FilterSelect id="transaction-status" label={t("filters.status")} value={status} onValueChange={setStatus}>
        <SelectItem value="all">{t("filters.allStatuses")}</SelectItem>
        {statuses.map((value) => <SelectItem key={value} value={value}>{t(`status.${value}`)}</SelectItem>)}
      </FilterSelect>
      {range === "custom" ? (
        <>
          <div className="min-w-40 flex-1 space-y-1.5">
            <Label htmlFor="transaction-start-date">{t("filters.startDate")}</Label>
            <Input id="transaction-start-date" type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} required />
          </div>
          <div className="min-w-40 flex-1 space-y-1.5">
            <Label htmlFor="transaction-end-date">{t("filters.endDate")}</Label>
            <Input id="transaction-end-date" type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} required />
          </div>
        </>
      ) : null}
      <div className="min-w-64 flex-[2] space-y-1.5">
        <Label htmlFor="transaction-search">{t("filters.search")}</Label>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
          <Input id="transaction-search" className="pl-9" value={search} placeholder={t("filters.searchPlaceholder")} onChange={(event) => setSearch(event.target.value)} />
        </div>
      </div>
      <div className="flex shrink-0 items-end gap-2">
        <Button type="submit" disabled={isPending}>{t("filters.apply")}</Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={clearFilters}>{t("filters.clear")}</Button>
      </div>
    </form>
  );
}

function WarningList({ warnings }: { warnings: Dashboard["warnings"] }) {
  const t = useTranslations("admin.billing.transactionsMode");
  if (warnings.length === 0) return null;
  return (
    <div className="space-y-2">
      {warnings.map((warning, index) => (
        <Alert key={`${warning.source}:${index}`} variant="destructive">
          <AlertTriangle />
          <AlertTitle>{t("warnings.title")}</AlertTitle>
          <AlertDescription>{t(warningTranslationKey(warning.source))}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

function Overview({ dashboard }: { dashboard: Dashboard }) {
  const t = useTranslations("admin.billing.transactionsMode");
  const stats = [
    ["totalAttempts", dashboard.overview.totalAttempts],
    ["successfulOrders", dashboard.overview.successfulOrders],
    ["pendingAttempts", dashboard.overview.pendingAttempts],
    ["failedAttempts", dashboard.overview.failedAttempts],
    ["cancelledAttempts", dashboard.overview.cancelledAttempts],
    ["refundedOrders", dashboard.overview.refundedOrders],
  ] as const;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={t("overview.conversionRate")} value={`${dashboard.overview.conversionRate.toFixed(2)}%`} description={t("overview.conversionDescription")} />
        {stats.map(([key, value]) => <MetricCard key={key} label={t(`overview.${key}`)} value={String(value)} description={t(`overview.${key}Description`)} />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {dashboard.overview.amounts.length === 0 ? <EmptyCard message={t("empty.financials")} /> : dashboard.overview.amounts.map((amount) => (
          <Card key={amount.currency}>
            <CardHeader><CardTitle>{t("overview.currencyCard", { currency: amount.currency })}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <MoneyMetric label={t("overview.grossRevenue")} value={formatMajorMoney(amount.grossRevenue, amount.currency)} />
              <MoneyMetric label={t("overview.preTaxRevenue")} value={formatMajorMoney(amount.preTaxRevenue, amount.currency)} />
              <MoneyMetric label={t("overview.taxCollected")} value={formatMajorMoney(amount.taxCollected, amount.currency)} />
              <MoneyMetric label={t("overview.refundedAmount")} value={formatMajorMoney(amount.refundedAmount, amount.currency)} />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <RevenueChart data={dashboard.revenue} t={t} />
        <AttemptsChart data={dashboard.attempts} t={t} />
        <ProductVolumeChart data={dashboard.products.rows} t={t} />
        <ProductRevenueChart data={dashboard.products.rows} t={t} />
      </div>
      <SuccessRateChart dashboard={dashboard} />
    </>
  );
}

function MetricCard({ label, value, description }: { label: string; value: string; description: string }) {
  return <Card className="gap-3"><CardHeader><CardDescription>{label}</CardDescription><CardTitle className="text-2xl">{value}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{description}</CardContent></Card>;
}

function MoneyMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-muted/20 p-3"><div className="text-sm text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold">{value}</div></div>;
}

function RevenueChart({ data, t }: { data: Dashboard["revenue"]; t: Translator }) {
  const chart = buildRevenueChartData(data);
  const accessibleRows = buildRevenueAccessibleRows(data);
  return (
    <ChartCard title={t("charts.revenueTitle")} description={t("charts.revenueDescription")} empty={chart.rows.length === 0} emptyMessage={t("empty.chart")}>
      <div role="img" aria-label={t("charts.revenueDescription")} aria-describedby="transaction-revenue-data">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chart.rows}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="period" /><YAxis /><Tooltip formatter={(value, name) => formatMajorMoney(Number(value ?? 0), String(name))} /><Legend />
            {chart.currencies.map((currency, index) => <Line key={currency} type="monotone" dataKey={currency} stroke={chartColors[index % chartColors.length]} strokeWidth={2.5} dot={false} connectNulls={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table id="transaction-revenue-data" className="sr-only"><caption>{t("charts.revenueDescription")}</caption><thead><tr><th>{t("charts.period")}</th><th>{t("charts.values")}</th></tr></thead><tbody>{accessibleRows.map((row) => <tr key={row.period}><th>{row.period}</th><td>{row.values.join(", ")}</td></tr>)}</tbody></table>
    </ChartCard>
  );
}

function AttemptsChart({ data, t }: { data: Dashboard["attempts"]; t: Translator }) {
  const accessibleRows = buildAttemptsAccessibleRows(data);
  return (
    <ChartCard title={t("charts.attemptsTitle")} description={t("charts.attemptsDescription")} empty={data.length === 0} emptyMessage={t("empty.chart")}>
      <div role="img" aria-label={t("charts.attemptsDescription")} aria-describedby="transaction-attempts-data">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="period" /><YAxis allowDecimals={false} /><Tooltip /><Legend />
            <Line type="monotone" dataKey="success" name={t("status.paid")} stroke="#15803d" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="failed" name={t("status.failed")} stroke="#dc2626" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="pending" name={t("status.pending_payment")} stroke="#d97706" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="cancelled" name={t("status.cancelled")} stroke="#64748b" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table id="transaction-attempts-data" className="sr-only"><caption>{t("charts.attemptsDescription")}</caption><thead><tr><th>{t("charts.period")}</th><th>{t("status.paid")}</th><th>{t("status.failed")}</th><th>{t("status.pending_payment")}</th><th>{t("status.cancelled")}</th></tr></thead><tbody>{accessibleRows.map((row) => <tr key={row.period}><th>{row.period}</th><td>{row.success}</td><td>{row.failed}</td><td>{row.pending}</td><td>{row.cancelled}</td></tr>)}</tbody></table>
    </ChartCard>
  );
}
function ProductVolumeChart({ data, t }: { data: Dashboard["products"]["rows"]; t: Translator }) {
  const totals = new Map<string, { product: string; unitsSold: number; orderCount: number }>();
  for (const row of data) {
    const current = totals.get(row.name) ?? { product: row.name, unitsSold: 0, orderCount: 0 };
    current.unitsSold += row.unitsSold;
    current.orderCount += row.orderCount;
    totals.set(row.name, current);
  }
  const rows = Array.from(totals.values()).sort((left, right) => right.unitsSold - left.unitsSold);
  return (
    <ChartCard title={t("charts.productVolumeTitle")} description={t("charts.productVolumeDescription")} empty={rows.length === 0} emptyMessage={t("empty.chart")}>
      <div role="img" aria-label={t("charts.productVolumeDescription")}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={rows}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="product" /><YAxis allowDecimals={false} /><Tooltip /><Legend />
            <Bar dataKey="unitsSold" name={t("products.unitsSold")} fill="#2563eb" radius={[4, 4, 0, 0]} />
            <Bar dataKey="orderCount" name={t("products.orderCount")} fill="#7c3aed" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only"><caption>{t("charts.productVolumeDescription")}</caption><thead><tr><th>{t("products.product")}</th><th>{t("products.unitsSold")}</th><th>{t("products.orderCount")}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.product}><th>{row.product}</th><td>{row.unitsSold}</td><td>{row.orderCount}</td></tr>)}</tbody></table>
    </ChartCard>
  );
}

function ProductRevenueChart({ data, t }: { data: Dashboard["products"]["rows"]; t: Translator }) {
  const currencies = Array.from(new Set(data.map((row) => row.currency))).sort();
  const products = new Map<string, Record<string, string | number>>();
  for (const row of data) {
    const current = products.get(row.name) ?? { product: row.name };
    current[row.currency] = Number(current[row.currency] ?? 0) + row.grossRevenue;
    products.set(row.name, current);
  }
  const rows = Array.from(products.values());
  return (
    <ChartCard title={t("charts.productRevenueTitle")} description={t("charts.productRevenueDescription")} empty={rows.length === 0} emptyMessage={t("empty.chart")}>
      <div role="img" aria-label={t("charts.productRevenueDescription")}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={rows}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="product" /><YAxis /><Tooltip formatter={(value, name) => formatMajorMoney(Number(value ?? 0), String(name))} /><Legend />
            {currencies.map((currency, index) => <Bar key={currency} dataKey={currency} fill={chartColors[index % chartColors.length]} radius={[4, 4, 0, 0]} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only"><caption>{t("charts.productRevenueDescription")}</caption><thead><tr><th>{t("products.product")}</th><th>{t("charts.values")}</th></tr></thead><tbody>{rows.map((row) => <tr key={String(row.product)}><th>{row.product}</th><td>{currencies.map((currency) => typeof row[currency] === "number" ? `${currency}: ${formatMajorMoney(Number(row[currency]), currency)}` : null).filter(Boolean).join(", ")}</td></tr>)}</tbody></table>
    </ChartCard>
  );
}

function OrderTrendCards({ trends }: { trends: Dashboard["orderTrends"] }) {
  const t = useTranslations("admin.billing.transactionsMode");
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {trends.map((trend) => (
        <Card key={trend.range} className="gap-2">
          <CardHeader className="pb-0">
            <CardDescription>{t(`orderTrends.${trend.range}`)}</CardDescription>
            <CardTitle className="text-3xl">{trend.total}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("orderTrends.breakdown", { successful: trend.successful, failed: trend.failed })}</p>
          </CardHeader>
          <CardContent className="h-24" role="img" aria-label={t("orderTrends.chartLabel", { range: t(`orderTrends.${trend.range}`) })}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend.points}><Line type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={2.5} dot={false} /></LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}


function ChartCard({ title, description, empty, emptyMessage, children }: { title: string; description: string; empty: boolean; emptyMessage: string; children: React.ReactNode }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent>{empty ? <EmptyState message={emptyMessage} /> : children}</CardContent></Card>;
}

function OrdersCard({ dashboard }: { dashboard: Dashboard }) {
  const t = useTranslations("admin.billing.transactionsMode");
  return (
    <div className="space-y-6">
      <OrderTrendCards trends={dashboard.orderTrends} />
      <Card>
        <CardHeader><CardTitle>{t("orders.title")}</CardTitle><CardDescription>{t("orders.description")}</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <OrdersFilters key={JSON.stringify(dashboard.filters)} filters={dashboard.filters} />
          {dashboard.orders.rows.length === 0 ? <EmptyState message={t("empty.orders")} /> : <OrdersTable rows={dashboard.orders.rows} />}
          <PaginationLinks pagination={dashboard.orders.pagination} />
        </CardContent>
      </Card>
    </div>
  );
}

function OrdersTable({ rows }: { rows: Order[] }) {
  const t = useTranslations("admin.billing.transactionsMode");
  const formatter = useFormatter();
  const [expandedOrderId, setExpandedOrderId] = React.useState<string | null>(null);

  function formatOrderDate(value: string) {
    return formatter.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" });
  }

  function toggleOrder(orderId: string) {
    setExpandedOrderId((current) => current === orderId ? null : orderId);
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table className="min-w-[760px]">
        <TableHeader><TableRow>
          <TableHead>{t("table.customer")}</TableHead><TableHead>{t("table.order")}</TableHead><TableHead>{t("table.total")}</TableHead><TableHead>{t("table.status")}</TableHead><TableHead>{t("table.created")}</TableHead><TableHead className="w-12"><span className="sr-only">{t("details.show")}</span></TableHead>
        </TableRow></TableHeader>
        <TableBody>{rows.map((order) => {
          const expanded = expandedOrderId === order.id;
          const detailsId = `order-details-${order.id}`;
          return (
            <React.Fragment key={order.id}>
              <TableRow className="cursor-pointer" onClick={() => toggleOrder(order.id)}>
                <TableCell><div className="font-medium">{order.userName ?? t("table.unknownUser")}</div><div className="text-xs text-muted-foreground">{order.userEmail}</div></TableCell>
                <TableCell className="max-w-52"><div className="truncate font-mono text-xs" title={order.id}>{order.id}</div></TableCell>
                <TableCell className="font-semibold">{formatMinorMoney(order.totalAmount, order.currency)}</TableCell>
                <TableCell><Badge variant={transactionStatusVariant(order.status)}>{t(`status.${order.status}`)}</Badge></TableCell>
                <TableCell className="whitespace-nowrap">{formatOrderDate(order.createdAt)}</TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-expanded={expanded}
                    aria-controls={detailsId}
                    aria-label={t(expanded ? "details.collapse" : "details.expand", { orderId: order.id })}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleOrder(order.id);
                    }}
                  >
                    <ChevronDown className={`transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
                  </Button>
                </TableCell>
              </TableRow>
              {expanded ? (
                <TableRow>
                  <TableCell colSpan={6} className="w-full whitespace-normal p-0">
                    <div id={detailsId} role="region" aria-label={t("details.show")} className="w-full p-4">
                      <OrderDetails order={order} formatOrderDate={formatOrderDate} />
                    </div>
                  </TableCell>
                </TableRow>
              ) : null}
            </React.Fragment>
          );
        })}</TableBody>
      </Table>
    </div>
  );
}

function formatNullableDate(value: string | null, notAvailable: string, formatOrderDate: (value: string) => string) {
  return value ? formatOrderDate(value) : notAvailable;
}

function OrderDetails({ order, formatOrderDate }: { order: Order; formatOrderDate: (value: string) => string }) {
  const t = useTranslations("admin.billing.transactionsMode");
  const notAvailable = t("table.notAvailable");
  return (
    <div className="w-full space-y-4 rounded-lg border bg-muted/20 p-4 font-sans">
      <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        <DetailField label={t("details.subtotal")} value={formatMinorMoney(order.subtotalAmount, order.currency)} />
        <DetailField label={t("details.tax")} value={formatMinorMoney(order.taxAmount, order.currency)} />
        <DetailField label={t("details.total")} value={formatMinorMoney(order.totalAmount, order.currency)} />
        <DetailField label={t("details.paymentId")} value={order.paymentId ?? notAvailable} mono />
      </dl>
      <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
        <DetailField label={t("details.userId")} value={order.userId} mono />
        <DetailField label={t("details.paymentProvider")} value={order.paymentProvider} />
        <DetailField label={t("details.checkoutReferenceId")} value={order.checkoutReferenceId ?? notAvailable} mono />
        <DetailField label={t("details.createdAt")} value={formatOrderDate(order.createdAt)} />
        <DetailField label={t("details.paidAt")} value={formatNullableDate(order.paidAt, notAvailable, formatOrderDate)} />
        <DetailField label={t("details.failedAt")} value={formatNullableDate(order.failedAt, notAvailable, formatOrderDate)} />
        <DetailField label={t("details.fulfilledAt")} value={formatNullableDate(order.fulfilledAt, notAvailable, formatOrderDate)} />
      </dl>
      <div className="space-y-2">
        <h4 className="font-semibold">{t("details.items")}</h4>
        {order.items.map((item) => (
          <dl key={item.id} className="grid gap-x-5 gap-y-3 rounded-md border bg-background p-3 sm:grid-cols-2">
            <DetailField label={t("details.itemId")} value={item.id} mono />
            <DetailField label={t("details.productKey")} value={item.productKey} mono />
            <DetailField label={t("details.name")} value={item.name} />
            <DetailField label={t("details.description")} value={item.description ?? notAvailable} />
            <DetailField label={t("details.quantity")} value={String(item.quantity)} />
            <DetailField label={t("details.unitPrice")} value={formatMinorMoney(item.unitPrice, item.currency)} />
            <DetailField label={t("details.itemTotal")} value={formatMinorMoney(item.totalAmount, item.currency)} />
            <DetailField label={t("details.currency")} value={item.currency} />
            <DetailField label={t("details.providerProductId")} value={item.providerProductId ?? notAvailable} mono />
          </dl>
        ))}
      </div>
    </div>
  );
}

function DetailField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className={mono ? "break-all font-mono text-xs" : "break-words"}>{value}</dd></div>;
}

function PaginationLinks({ pagination }: { pagination: Pagination }) {
  const t = useTranslations("admin.billing.transactionsMode");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (pagination.totalPages <= 1) return null;
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3" aria-label={t("pagination.label")}>
      <span className="text-sm text-muted-foreground">{t("pagination.page", { current: pagination.page, total: pagination.totalPages, count: pagination.totalItems })}</span>
      <div className="flex gap-2">
        {pagination.page > 1 ? <Button asChild variant="outline" size="sm"><Link href={buildTransactionDashboardHref(pathname, searchParams, { page: pagination.page - 1 })}>{t("pagination.previous")}</Link></Button> : <Button variant="outline" size="sm" disabled>{t("pagination.previous")}</Button>}
        {pagination.page < pagination.totalPages ? <Button asChild variant="outline" size="sm"><Link href={buildTransactionDashboardHref(pathname, searchParams, { page: pagination.page + 1 })}>{t("pagination.next")}</Link></Button> : <Button variant="outline" size="sm" disabled>{t("pagination.next")}</Button>}
      </div>
    </nav>
  );
}

function Refunds({ dashboard }: { dashboard: Dashboard }) {
  const t = useTranslations("admin.billing.transactionsMode");
  const router = useRouter();
  const [selectedOrder, setSelectedOrder] = React.useState<Order | null>(null);
  const [refundReason, setRefundReason] = React.useState("");
  const [adminSecret, setAdminSecret] = React.useState("");
  const refundMutation = useMutation({
    mutationFn: () => {
      if (!selectedOrder) throw new Error(t("refunds.missingOrder"));
      return createAdminTransactionRefund({
        orderId: selectedOrder.id,
        reason: refundReason.trim() || undefined,
        secret: adminSecret.trim(),
      });
    },
    onSuccess: () => {
      toast.success(t("refunds.success"));
      setSelectedOrder(null);
      setRefundReason("");
      setAdminSecret("");
      router.refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("refunds.error")),
  });

  function closeDialog() {
    if (refundMutation.isPending) return;
    setSelectedOrder(null);
    setRefundReason("");
    setAdminSecret("");
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {dashboard.refunds.totalAmounts.length === 0 ? <EmptyCard message={t("empty.refunds")} /> : dashboard.refunds.totalAmounts.map((total) => <MetricCard key={total.currency} label={t("refunds.total", { currency: total.currency })} value={formatMajorMoney(total.amount, total.currency)} description={t("refunds.totalDescription")} />)}
      </div>
      <Card>
        <CardHeader><CardTitle>{t("refunds.refundableTitle")}</CardTitle><CardDescription>{t("refunds.refundableDescription")}</CardDescription></CardHeader>
        <CardContent>{dashboard.refunds.refundableRows.length === 0 ? <EmptyState message={t("empty.refundableOrders")} /> : <RefundableOrdersTable rows={dashboard.refunds.refundableRows} onRefund={setSelectedOrder} />}</CardContent>
      </Card>
      <Card><CardHeader><CardTitle>{t("refunds.localTitle")}</CardTitle><CardDescription>{t("refunds.localDescription")}</CardDescription></CardHeader><CardContent>{dashboard.refunds.localRows.length === 0 ? <EmptyState message={t("empty.refunds")} /> : <OrdersTable rows={dashboard.refunds.localRows} />}</CardContent></Card>
      <ProviderRefundsTable rows={dashboard.refunds.providerRows} />
      <Dialog open={Boolean(selectedOrder)} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("refunds.dialog.title")}</DialogTitle>
            <DialogDescription>{t("refunds.dialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium">{selectedOrder?.userEmail}</div>
              <div className="font-mono text-xs text-muted-foreground">{selectedOrder?.id}</div>
              <div className="mt-2 font-semibold">{selectedOrder ? formatMinorMoney(selectedOrder.totalAmount, selectedOrder.currency) : null}</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="transaction-refund-reason">{t("refunds.dialog.reason")}</Label>
              <Textarea id="transaction-refund-reason" value={refundReason} onChange={(event) => setRefundReason(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="transaction-refund-secret">{t("refunds.dialog.secret")}</Label>
              <Input id="transaction-refund-secret" type="password" value={adminSecret} onChange={(event) => setAdminSecret(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={refundMutation.isPending} onClick={closeDialog}>{t("refunds.dialog.cancel")}</Button>
            <Button disabled={!adminSecret.trim() || refundMutation.isPending} onClick={() => refundMutation.mutate()}>
              {refundMutation.isPending ? t("refunds.dialog.submitting") : t("refunds.dialog.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RefundableOrdersTable({ rows, onRefund }: { rows: Order[]; onRefund: (order: Order) => void }) {
  const t = useTranslations("admin.billing.transactionsMode");
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table className="min-w-[760px]">
        <TableHeader><TableRow><TableHead>{t("table.customer")}</TableHead><TableHead>{t("table.order")}</TableHead><TableHead>{t("table.payment")}</TableHead><TableHead>{t("table.total")}</TableHead><TableHead>{t("table.created")}</TableHead><TableHead className="text-right">{t("table.actions")}</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((order) => <TableRow key={order.id}>
          <TableCell><div className="font-medium">{order.userName ?? t("table.unknownUser")}</div><div className="text-xs text-muted-foreground">{order.userEmail}</div></TableCell>
          <TableCell className="font-mono text-xs">{order.id}</TableCell>
          <TableCell className="font-mono text-xs">{order.paymentId}</TableCell>
          <TableCell className="font-semibold">{formatMinorMoney(order.totalAmount, order.currency)}</TableCell>
          <TableCell className="whitespace-nowrap">{formatDateTime(order.createdAt)}</TableCell>
          <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => onRefund(order)}><RefreshCcw className="mr-2 size-4" />{t("refunds.action")}</Button></TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </div>
  );
}

function ProviderRefundsTable({ rows }: { rows: Dashboard["refunds"]["providerRows"] }) {
  const t = useTranslations("admin.billing.transactionsMode");
  return <Card><CardHeader><CardTitle>{t("refunds.providerTitle")}</CardTitle><CardDescription>{t("refunds.providerDescription")}</CardDescription></CardHeader><CardContent>{rows.length === 0 ? <EmptyState message={t("empty.providerRefunds")} /> : <div className="overflow-x-auto rounded-lg border"><Table className="min-w-[760px]"><TableHeader><TableRow><TableHead>{t("provider.provider")}</TableHead><TableHead>{t("provider.refundId")}</TableHead><TableHead>{t("table.payment")}</TableHead><TableHead>{t("table.status")}</TableHead><TableHead>{t("provider.amount")}</TableHead><TableHead>{t("provider.reason")}</TableHead><TableHead>{t("table.created")}</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={`${row.provider}:${row.refundId}`}><TableCell>{row.provider}</TableCell><TableCell className="font-mono text-xs">{row.refundId}</TableCell><TableCell className="font-mono text-xs">{row.paymentId}</TableCell><TableCell><Badge variant="outline">{t(providerRefundStatusTranslationKey(row.status))}</Badge></TableCell><TableCell>{row.amount ? formatProviderMoney(row.amount) : t("table.notAvailable")}</TableCell><TableCell>{row.reason ?? t("table.notAvailable")}</TableCell><TableCell>{row.createdAt ? formatDateTime(row.createdAt) : t("table.notAvailable")}</TableCell></TableRow>)}</TableBody></Table></div>}</CardContent></Card>;
}

function Products({ dashboard }: { dashboard: Dashboard }) {
  const t = useTranslations("admin.billing.transactionsMode");
  return (
    <>
      <Card><CardHeader><CardTitle>{t("products.localTitle")}</CardTitle><CardDescription>{t("products.localDescription")}</CardDescription></CardHeader><CardContent>{dashboard.products.rows.length === 0 ? <EmptyState message={t("empty.products")} /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{dashboard.products.rows.map((row) => <div key={`${row.productKey}:${row.currency}`} className="rounded-xl border p-4"><div className="font-semibold">{row.name}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{row.productKey}</div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><ProductMetric label={t("products.unitsSold")} value={String(row.unitsSold)} /><ProductMetric label={t("products.orderCount")} value={String(row.orderCount)} /><ProductMetric label={t("products.grossRevenue")} value={formatMajorMoney(row.grossRevenue, row.currency)} /></dl></div>)}</div>}</CardContent></Card>
      <ProviderProductsTable rows={dashboard.products.providerRows} />
    </>
  );
}

function ProductMetric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>;
}

function ProviderProductsTable({ rows }: { rows: Dashboard["products"]["providerRows"] }) {
  const t = useTranslations("admin.billing.transactionsMode");
  return <Card><CardHeader><CardTitle>{t("products.providerTitle")}</CardTitle><CardDescription>{t("products.providerDescription")}</CardDescription></CardHeader><CardContent>{rows.length === 0 ? <EmptyState message={t("empty.providerProducts")} /> : <div className="overflow-x-auto rounded-lg border"><Table className="min-w-[860px]"><TableHeader><TableRow><TableHead>{t("provider.provider")}</TableHead><TableHead>{t("products.product")}</TableHead><TableHead>{t("products.productId")}</TableHead><TableHead>{t("products.price")}</TableHead><TableHead>{t("products.recurring")}</TableHead><TableHead>{t("products.taxCategory")}</TableHead><TableHead>{t("products.updated")}</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={`${row.provider}:${row.productId}`}><TableCell>{row.provider}</TableCell><TableCell><div className="font-medium">{row.name ?? t("table.notAvailable")}</div><div className="max-w-sm text-xs text-muted-foreground">{row.description}</div></TableCell><TableCell className="font-mono text-xs">{row.productId}</TableCell><TableCell>{row.price ? formatProviderMoney(row.price) : t("table.notAvailable")}</TableCell><TableCell>{row.isRecurring === null ? t("table.notAvailable") : row.isRecurring ? t("common.yes") : t("common.no")}</TableCell><TableCell>{row.taxCategory ?? t("table.notAvailable")}</TableCell><TableCell>{row.updatedAt ? formatDateTime(row.updatedAt) : t("table.notAvailable")}</TableCell></TableRow>)}</TableBody></Table></div>}</CardContent></Card>;
}

function SuccessRateChart({ dashboard }: { dashboard: Dashboard }) {
  const t = useTranslations("admin.billing.transactionsMode");
  const accessibleRows = buildSuccessAccessibleRows(dashboard.successRate);
  return (
    <ChartCard title={t("charts.successTitle")} description={t("charts.successDescription")} empty={dashboard.successRate.length === 0} emptyMessage={t("empty.chart")}>
      <div role="img" aria-label={t("charts.successDescription")} aria-describedby="transaction-success-data"><ResponsiveContainer width="100%" height={340}><LineChart data={dashboard.successRate}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="period" /><YAxis yAxisId="count" allowDecimals={false} /><YAxis yAxisId="rate" orientation="right" domain={[0, 100]} tickFormatter={(value) => `${value}%`} /><Tooltip formatter={(value, name) => name === t("success.rate") ? `${Number(value ?? 0).toFixed(2)}%` : Number(value ?? 0)} /><Legend /><Line yAxisId="count" dataKey="total" name={t("success.total")} stroke="#64748b" strokeWidth={2} dot={false} /><Line yAxisId="count" dataKey="successful" name={t("success.successful")} stroke="#15803d" strokeWidth={2} dot={false} /><Line yAxisId="rate" dataKey="rate" name={t("success.rate")} stroke="#2563eb" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></div>
      <table id="transaction-success-data" className="sr-only"><caption>{t("charts.successDescription")}</caption><thead><tr><th>{t("charts.period")}</th><th>{t("success.total")}</th><th>{t("success.successful")}</th><th>{t("success.rate")}</th></tr></thead><tbody>{accessibleRows.map((row) => <tr key={row.period}><th>{row.period}</th><td>{row.total}</td><td>{row.successful}</td><td>{row.rate}</td></tr>)}</tbody></table>
    </ChartCard>
  );
}

function EmptyCard({ message }: { message: string }) {
  return <Card><CardContent><EmptyState message={message} /></CardContent></Card>;
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{message}</div>;
}
