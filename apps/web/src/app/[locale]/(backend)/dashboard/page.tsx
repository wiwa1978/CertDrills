import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getServerSession } from "@/lib/auth-session";
import { getCreditBalanceServer, getMyApplicationConfigServer } from "@/lib/api/me.server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/layout/backend/shared/stat-card";
import { CreditCard, Wallet, TrendingDown, DollarSign } from "lucide-react";
import { ClientDashboardWrapper } from "./client-wrapper";

export default async function DashboardPage() {
  const session = await getServerSession();
  if (!session?.user) {
    redirect("/login");
  }

  const t = await getTranslations("dashboard");
  const applicationConfig = await getMyApplicationConfigServer();

  return (
    <ClientDashboardWrapper>
      {/* Stats cards */}
      {applicationConfig.billing.creditSurfacesEnabled ? (
        <Suspense fallback={<CreditCardsSkeleton />}>
          <CreditCards />
        </Suspense>
      ) : null}
    </ClientDashboardWrapper>
  );
}

async function CreditCards() {
  const balance = await getCreditBalanceServer();
  const t = await getTranslations("admin.billing.stats");

  // Calculate bonus credits (total received - purchased)
  const totalCreditsReceived = balance.balance + balance.totalSpent;
  const bonusCredits = totalCreditsReceived - balance.totalPurchased;
  const totalAvailableCredits = balance.totalPurchased + bonusCredits - balance.totalSpent;

  const totalPurchasedNum = Number(balance.totalPurchased);
  const bonusCreditsNum = Number(bonusCredits);
  const totalCreditsConsumedNum = Number(balance.totalSpent);
  const totalRevenueNum = Number(balance.totalPurchasedAmount);
  const totalPurchasesNum = Number(balance.totalPurchases);
  const totalCreditsReceivedNum = Number(totalCreditsReceived);

  const stats = [
    {
      title: t("totalCreditsPurchased"),
      value: totalCreditsReceivedNum.toFixed(2),
      icon: CreditCard,
      iconColor: "text-green-600",
      iconBgColor: "bg-green-100",
      description: `${totalPurchasedNum.toFixed(2)} purchased credits + ${bonusCreditsNum.toFixed(2)} bonus`,
    },
    {
      title: t("totalAvailableCredits"),
      value: totalAvailableCredits.toFixed(2),
      icon: Wallet,
      iconColor: "text-blue-600",
      iconBgColor: "bg-blue-100",
      description: t("totalAvailableCreditsDescription"),
    },
    {
      title: t("totalCreditsConsumed"),
      value: totalCreditsConsumedNum.toFixed(2),
      icon: TrendingDown,
      iconColor: "text-orange-600",
      iconBgColor: "bg-orange-100",
      description: t("totalCreditsConsumedDescription"),
    },
    {
      title: t("totalRevenue"),
      value: `€${totalRevenueNum.toFixed(2)}`,
      icon: DollarSign,
      iconColor: "text-purple-600",
      iconBgColor: "bg-purple-100",
      description: `across ${totalPurchasesNum.toFixed(0)} purchases`,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {stats.map((stat) => (
        <StatCard
          key={stat.title}
          title={stat.title}
          value={stat.value}
          icon={stat.icon}
          iconColor={stat.iconColor}
          iconBgColor={stat.iconBgColor}
          description={stat.description}
        />
      ))}
    </div>
  );
}

function CreditCardsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-4 rounded-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
