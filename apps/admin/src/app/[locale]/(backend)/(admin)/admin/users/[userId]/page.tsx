import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  getAdminUserCreditBalanceServer,
  getAdminUserCreditHistoryServer,
  getAdminUserCreditPurchasesServer,
  getAdminUserServer,
} from "@/lib/api/admin.server";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { TransactionHistoryTable } from "@/components/layout/backend/admin/shared/transaction-history-table";
import { PurchaseHistoryTable } from "@/components/layout/backend/admin/shared/purchase-history-table";
import { formatDate } from "@/lib/utils";
import { StatCard } from "@/components/layout/backend/shared/stat-card";
import { CreditCard, Wallet, TrendingDown, DollarSign } from "lucide-react";

interface UserDetailPageProps {
  params: Promise<{
    userId: string;
  }>;
}

type AdminUserRecord = NonNullable<Awaited<ReturnType<typeof getAdminUserServer>>["data"]>;

export default async function UserDetailPage({ params }: UserDetailPageProps) {
  const { userId } = await params;
  const t = await getTranslations("admin.userDetail");

  // Fetch user details
  const userResponse = await getAdminUserServer(userId).catch(() => ({ data: null }));

  if (!userResponse.data) {
    notFound();
  }

  const user = userResponse.data;

  return (
    <Container className="py-6">
      {/* Back Button */}
      <div className="mb-6">
        <Button variant="ghost" asChild>
          <Link href="/admin/users" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            {t("backToUsers")}
          </Link>
        </Button>
      </div>

      {/* User Info Header */}
      <Suspense fallback={<UserInfoHeaderSkeleton />}>
        <UserInfoHeader user={user} />
      </Suspense>

      {/* Credit Stats Cards */}
      <div className="mb-6">
        <Suspense fallback={<CreditCardsSkeleton />}>
          <CreditCards userId={userId} />
        </Suspense>
      </div>

      {/* Transaction and Purchase History */}
      <div className="grid gap-6 lg:grid-cols-1">
        <Suspense fallback={<TableSkeleton />}>
          <UserTransactionHistory userId={userId} userName={user.name} />
        </Suspense>

        <Suspense fallback={<TableSkeleton />}>
          <UserPurchaseHistory userId={userId} userName={user.name} />
        </Suspense>
      </div>
    </Container>
  );
}

async function UserInfoHeader({ user }: { user: AdminUserRecord }) {
  const t = await getTranslations("admin.userDetail");
  const tUsers = await getTranslations("admin.users");

  // Get initials for avatar
  const initials = user.name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Determine status
  let status = "unverified";
  if (user.banned) {
    status = "banned";
  } else if (user.emailVerified) {
    status = "verified";
  }

  return (
    <div className="flex flex-col md:flex-row gap-6 mb-6">
      {/* Left Section: Avatar, Name, Email */}
      <Card className="md:w-1/2">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-lg font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h2 className="text-2xl font-bold">{user.name}</h2>
              <p className="text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Right Section: User ID, Role, Status, Created */}
      <Card className="md:w-1/2">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t("userId")}:</span>
              <span className="text-xs text-muted-foreground font-mono">
                {user.id}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t("role")}:</span>
              <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                {user.role}
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t("status")}:</span>
              <Badge
                variant={
                  status === "banned"
                    ? "destructive"
                    : status === "verified"
                      ? "default"
                      : "secondary"
                }
              >
                {tUsers(`status.${status}`)}
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t("createdAt")}:</span>
              <span className="text-sm">{formatDate(user.createdAt)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

async function CreditCards({ userId }: { userId: string }) {
  const balance = await getAdminUserCreditBalanceServer(userId);
  const t = await getTranslations("admin.billing.stats");

  // Calculate bonus credits (total received - purchased)
  const totalCreditsReceived = balance.balance + balance.totalSpent;
  const bonusCredits = totalCreditsReceived - balance.totalPurchased;
  const totalAvailableCredits = balance.totalPurchased + bonusCredits - balance.totalSpent;

  const stats = [
    {
      title: t("totalCreditsPurchased"),
      value: Number(totalCreditsReceived).toFixed(2),
      icon: CreditCard,
      iconColor: "text-green-600",
      iconBgColor: "bg-green-100",
      description: `${Number(balance.totalPurchased).toFixed(2)} purchased credits + ${Number(bonusCredits).toFixed(2)} bonus`,
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
      value: Number(balance.totalSpent).toFixed(2),
      icon: TrendingDown,
      iconColor: "text-orange-600",
      iconBgColor: "bg-orange-100",
      description: t("totalCreditsConsumedDescription"),
    },
    {
      title: t("totalRevenue"),
      value: `€${Number(balance.totalPurchasedAmount).toFixed(2)}`,
      icon: DollarSign,
      iconColor: "text-purple-600",
      iconBgColor: "bg-purple-100",
      description: `across ${Number(balance.totalPurchases).toFixed(0)} purchases`,
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

async function UserTransactionHistory({ userId, userName }: { userId: string; userName: string }) {
  const t = await getTranslations("admin.billing.transactions");
  const transactions = await getAdminUserCreditHistoryServer(userId);

  // Calculate balanceBefore for each transaction
  const transactionsWithBalanceBefore = transactions.map((transaction) => {
    const balanceAfter = parseFloat(transaction.balanceAfter);
    const amount = parseFloat(transaction.amount);
    const balanceBefore = (balanceAfter - amount).toFixed(2);
    return {
      ...transaction,
      balanceBefore,
    };
  });

  return (
    <TransactionHistoryTable
      transactions={transactionsWithBalanceBefore}
      showCard={true}
      showUserColumns={false}
      enableSearch={false}
      description={t("descriptionForUser", { userName })}
    />
  );
}

async function UserPurchaseHistory({ userId, userName }: { userId: string; userName: string }) {
  const t = await getTranslations("admin.billing.purchases");
  const purchases = await getAdminUserCreditPurchasesServer(userId);

  return (
    <PurchaseHistoryTable
      purchases={purchases}
      showCard={true}
      showUserColumns={false}
      enableSearch={false}
      bonusText={t("bonus")}
      description={t("descriptionForUser", { userName })}
    />
  );
}

function UserInfoHeaderSkeleton() {
  return (
    <div className="flex flex-col md:flex-row gap-6 mb-6">
      {/* Left Section: Avatar, Name, Email */}
      <Card className="md:w-1/2">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Right Section: User ID, Role, Status, Created */}
      <Card className="md:w-1/2">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-4 w-32" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CreditCardsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {[1, 2, 3].map((i) => (
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

function TableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32 mb-2" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
