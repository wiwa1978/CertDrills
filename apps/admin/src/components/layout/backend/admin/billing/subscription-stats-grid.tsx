import { CreditCard, DollarSign, TrendingDown, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { StatCard } from "@/components/layout/backend/shared/stat-card";
import type { SubscriptionStats } from "@platform/contracts";

type SubscriptionStatsGridProps = {
  stats: SubscriptionStats;
};

export async function SubscriptionStatsGrid({ stats }: SubscriptionStatsGridProps) {
  const t = await getTranslations("admin.billing.subscriptionsMode");
  const cards = [
    {
      title: t("stats.activeSubscriptions"),
      value: stats.activeSubscriptions.toString(),
      icon: Users,
      iconColor: "text-green-600",
      iconBgColor: "bg-green-100",
      description: t("stats.activeSubscriptionsDescription", {
        trialing: stats.trialingSubscriptions,
        total: stats.totalSubscriptions,
      }),
    },
    {
      title: t("stats.pastDueSubscriptions"),
      value: stats.pastDueSubscriptions.toString(),
      icon: TrendingDown,
      iconColor: "text-orange-600",
      iconBgColor: "bg-orange-100",
      description: t("stats.pastDueSubscriptionsDescription", {
        canceled: stats.canceledSubscriptions,
      }),
    },
    {
      title: t("stats.monthlyRecurringRevenue"),
      value: `€${stats.monthlyRecurringRevenue.toFixed(2)}`,
      icon: DollarSign,
      iconColor: "text-purple-600",
      iconBgColor: "bg-purple-100",
      description: t("stats.monthlyRecurringRevenueDescription"),
    },
    {
      title: t("stats.annualRecurringRevenue"),
      value: `€${stats.annualRecurringRevenue.toFixed(2)}`,
      icon: CreditCard,
      iconColor: "text-blue-600",
      iconBgColor: "bg-blue-100",
      description: t("stats.annualRecurringRevenueDescription"),
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
