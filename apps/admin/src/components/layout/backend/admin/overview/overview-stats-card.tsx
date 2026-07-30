import { getTranslations } from "next-intl/server";
import { StatCard } from "@/components/layout/backend/shared/stat-card";
import {
  Users,
  Ban,
  ShoppingCart,
  Clock,
  XCircle,
  RotateCcw,
  TrendingDown,
  Gift,
  CreditCard,
  ArrowLeftRight,
} from "lucide-react";

interface AdminStatsProps {
  totalUsers: number;
  thisMonthUsers: number;
  lastMonthUsers: number;
  totalBannedUsers: number;
  totalCompletedPurchases: number;
  lastMonthCompletedPurchases: number;
  totalPendingPurchases: number;
  totalFailedPurchases: number;
  totalRefundedPurchases: number;
  totalUsageTransactions: number;
  lastMonthUsageTransactions: number;
  totalBonusTransactions: number;
  totalPurchaseTransactions: number;
  lastMonthPurchaseTransactions: number;
  totalRefundTransactions: number;
}

export async function AdminStatsCard({
  totalUsers,
  thisMonthUsers,
  lastMonthUsers,
  totalBannedUsers,
  totalCompletedPurchases,
  lastMonthCompletedPurchases,
  totalPendingPurchases,
  totalFailedPurchases,
  totalRefundedPurchases,
  totalUsageTransactions,
  lastMonthUsageTransactions,
  totalBonusTransactions,
  totalPurchaseTransactions,
  lastMonthPurchaseTransactions,
  totalRefundTransactions,
}: AdminStatsProps) {
  const t = await getTranslations("admin.dashboard.stats");

  // Calculate percentage change: (new total - old total) / old total * 100
  const calculatePercentageChange = (newTotal: number, oldTotal: number) => {
    if (oldTotal === 0) return newTotal > 0 ? 100 : 0;
    return ((newTotal - oldTotal) / oldTotal) * 100;
  };

  const usersTrend = calculatePercentageChange(totalUsers, lastMonthUsers);
  const completedPurchasesTrend = calculatePercentageChange(totalCompletedPurchases, lastMonthCompletedPurchases);
  const usageTransactionsTrend = calculatePercentageChange(totalUsageTransactions, lastMonthUsageTransactions);
  const purchaseTransactionsTrend = calculatePercentageChange(totalPurchaseTransactions, lastMonthPurchaseTransactions);

  const stats = [
    {
      title: t("totalUsers"),
      value: totalUsers,
      icon: Users,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
      trend: {
        value: usersTrend,
        label: "vs last month",
      },
    },
    {
      title: t("totalBannedUsers"),
      value: totalBannedUsers,
      icon: Ban,
      color: "text-red-600",
      bgColor: "bg-red-100",
    },
    {
      title: t("totalCompletedPurchases"),
      value: totalCompletedPurchases,
      icon: ShoppingCart,
      color: "text-green-600",
      bgColor: "bg-green-100",
      trend: {
        value: completedPurchasesTrend,
        label: "vs last month",
      },
    },
    {
      title: t("totalPendingPurchases"),
      value: totalPendingPurchases,
      icon: Clock,
      color: "text-yellow-600",
      bgColor: "bg-yellow-100",
    },
    {
      title: t("totalFailedPurchases"),
      value: totalFailedPurchases,
      icon: XCircle,
      color: "text-red-600",
      bgColor: "bg-red-100",
    },
    {
      title: t("totalRefundedPurchases"),
      value: totalRefundedPurchases,
      icon: RotateCcw,
      color: "text-gray-600",
      bgColor: "bg-gray-100",
    },
    {
      title: t("totalUsageTransactions"),
      value: totalUsageTransactions,
      icon: TrendingDown,
      color: "text-orange-600",
      bgColor: "bg-orange-100",
      trend: {
        value: usageTransactionsTrend,
        label: "vs last month",
      },
    },
    {
      title: t("totalBonusTransactions"),
      value: totalBonusTransactions,
      icon: Gift,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
    {
      title: t("totalPurchaseTransactions"),
      value: totalPurchaseTransactions,
      icon: CreditCard,
      color: "text-green-600",
      bgColor: "bg-green-100",
      trend: {
        value: purchaseTransactionsTrend,
        label: "vs last month",
      },
    },
    {
      title: t("totalRefundTransactions"),
      value: totalRefundTransactions,
      icon: ArrowLeftRight,
      color: "text-gray-600",
      bgColor: "bg-gray-100",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {stats.map((stat) => (
        <StatCard
          key={stat.title}
          title={stat.title}
          value={stat.value}
          icon={stat.icon}
          iconColor={stat.color}
          iconBgColor={stat.bgColor}
          trend={stat.trend}
        />
      ))}
    </div>
  );
}
