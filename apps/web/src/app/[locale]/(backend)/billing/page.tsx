import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getServerSession } from "@/lib/auth-session";
import { getCreditPurchasesServer, getMyApplicationConfigServer, getMySubscriptionPaymentsServer, getMySubscriptionServer } from "@/lib/api/me.server";
import { PurchaseHistory } from "@/components/layout/backend/billing/purchase-history";
import { CreditPricing } from "@/components/layout/backend/billing/credit-pricing";
import { RedeemVoucherCard } from "@/components/layout/backend/billing/redeem-voucher-card";
import { Separator } from "@/components/ui/separator";
import {
  TransactionHistory,
  TableSkeleton,
} from "@/components/layout/backend/billing/transaction-history";
import { BillingClientWrapper } from "./client-wrapper";
import { SubscriptionBillingClientWrapper } from "./subscription-client-wrapper";
import { SubscriptionPricing } from "@/components/layout/backend/billing/subscription-pricing";
import { SubscriptionStatus } from "@/components/layout/backend/billing/subscription-status";
import { SubscriptionDiscountForm } from "@/components/layout/backend/billing/subscription-discount-form";
import { SubscriptionHistory } from "@/components/layout/backend/billing/subscription-history";

type BillingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type CheckoutOutcome = "success" | "cancel" | null;

export function getCheckoutOutcome(
  searchParams?: Record<string, string | string[] | undefined>
): CheckoutOutcome {
  const success = Array.isArray(searchParams?.success)
    ? searchParams.success[0]
    : searchParams?.success;
  const cancel = Array.isArray(searchParams?.cancel)
    ? searchParams.cancel[0]
    : searchParams?.cancel;

  return success === "true" ? "success" : cancel === "true" ? "cancel" : null;
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const session = await getServerSession();
  if (!session?.user) {
    redirect("/login");
  }

  const resolvedSearchParams = await searchParams;
  const checkoutOutcome = getCheckoutOutcome(resolvedSearchParams);
  const t = await getTranslations("billing");
  const applicationConfig = await getMyApplicationConfigServer();

  if (applicationConfig.billing.subscriptionSurfacesEnabled) {
    return <SubscriptionBillingPage checkoutOutcome={checkoutOutcome} />;
  }

  if (!applicationConfig.billing.creditSurfacesEnabled) {
    return null;
  }

  return (
    <BillingClientWrapper checkoutOutcome={checkoutOutcome}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>

        <CreditPricing showContainer={false} />

        <RedeemVoucherCard />

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

async function SubscriptionBillingPage({ checkoutOutcome }: { checkoutOutcome: CheckoutOutcome }) {
  const t = await getTranslations("billing");
  const subscriptionT = await getTranslations("billing.subscription");
  const [subscription, payments] = await Promise.all([
    getMySubscriptionServer(),
    getMySubscriptionPaymentsServer(50),
  ]);

  return (
    <SubscriptionBillingClientWrapper checkoutOutcome={checkoutOutcome}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{subscriptionT("description")}</p>
        </div>

        <SubscriptionStatus subscription={subscription} />
        <SubscriptionPricing />
        <SubscriptionDiscountForm />
        <SubscriptionHistory payments={payments} />
      </div>
    </SubscriptionBillingClientWrapper>
  );
}

async function PurchaseHistoryWrapper() {
  const purchases = await getCreditPurchasesServer(50);
  
  return <PurchaseHistory purchases={purchases} />;
}
