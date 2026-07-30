import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getServerSession } from "@/lib/auth-session";
import { getMyApplicationConfigServer } from "@/lib/api/me.server";
import { getCreditPurchases } from "@/lib/services/credits";
import { PurchaseHistory } from "@/components/layout/backend/billing/purchase-history";
import { CreditPricing } from "@/components/layout/backend/billing/credit-pricing";
import { Separator } from "@/components/ui/separator";
import {
  TransactionHistory,
  TableSkeleton,
} from "@/components/layout/backend/billing/transaction-history";
import { BillingClientWrapper } from "./client-wrapper";

export default async function BillingPage() {
  const session = await getServerSession();
  if (!session?.user) {
    redirect("/login");
  }

  const t = await getTranslations("billing");
  const applicationConfig = await getMyApplicationConfigServer();

  if (!applicationConfig.billing.creditSurfacesEnabled) {
    return null;
  }

  return (
    <BillingClientWrapper>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>

        <CreditPricing showContainer={false} />

        <Separator className="my-8" />

        <div className="space-y-6">
          <Suspense fallback={<TableSkeleton />}>
            <PurchaseHistoryWrapper />
          </Suspense>

          <Suspense fallback={<TableSkeleton />}>
            <TransactionHistory />
          </Suspense>
        </div>
      </div>
    </BillingClientWrapper>
  );
}

async function PurchaseHistoryWrapper() {
  const purchases = await getCreditPurchases(50);
  
  return <PurchaseHistory purchases={purchases} />;
}
