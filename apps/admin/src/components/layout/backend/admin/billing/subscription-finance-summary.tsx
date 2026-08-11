import { AlertTriangle, Banknote, RefreshCcw, ReceiptText } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { StatCard } from "@/components/layout/backend/shared/stat-card";
import type { SubscriptionFinanceSummary as SubscriptionFinanceSummaryData } from "@platform/contracts";

type SubscriptionFinanceSummaryProps = {
  summary: SubscriptionFinanceSummaryData;
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export async function SubscriptionFinanceSummary({ summary }: SubscriptionFinanceSummaryProps) {
  const t = await getTranslations("admin.billing.subscriptionsMode.finance");
  const driftCount = summary.unmatchedProviderPayments + summary.unmatchedProviderSubscriptions;

  const cards = [
    {
      title: t("grossRevenue"),
      value: money(summary.grossRevenue, summary.currency),
      icon: Banknote,
      iconColor: "text-emerald-600",
      iconBgColor: "bg-emerald-100",
      description: t("grossRevenueDescription", { count: summary.completedPayments }),
    },
    {
      title: t("netRevenue"),
      value: money(summary.netRevenue, summary.currency),
      icon: ReceiptText,
      iconColor: "text-blue-600",
      iconBgColor: "bg-blue-100",
      description: t("netRevenueDescription", { refunded: money(summary.refundedRevenue, summary.currency) }),
    },
    {
      title: t("refunds"),
      value: summary.refundedPayments.toString(),
      icon: RefreshCcw,
      iconColor: "text-orange-600",
      iconBgColor: "bg-orange-100",
      description: t("refundsDescription", { amount: money(summary.refundedRevenue, summary.currency) }),
    },
    {
      title: t("providerDrift"),
      value: driftCount.toString(),
      icon: AlertTriangle,
      iconColor: driftCount > 0 ? "text-red-600" : "text-slate-600",
      iconBgColor: driftCount > 0 ? "bg-red-100" : "bg-slate-100",
      description: summary.providerFinanceAvailable
        ? t("providerDriftDescription", {
          payments: summary.unmatchedProviderPayments,
          subscriptions: summary.unmatchedProviderSubscriptions,
        })
        : t("providerUnavailable"),
    },
  ];

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <StatCard
          key={card.title}
          title={card.title}
          value={card.value}
          icon={card.icon}
          iconColor={card.iconColor}
          iconBgColor={card.iconBgColor}
          description={card.description}
        />
      ))}
    </div>
  );
}
