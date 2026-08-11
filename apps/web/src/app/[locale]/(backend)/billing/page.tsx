import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getServerSession } from "@/lib/auth-session";
import { getCountriesServer, getCreditPurchasesServer, getMyApplicationConfigServer, getMySubscriptionPaymentsServer, getMySubscriptionServer, getMyTransactionBasketServer, getMyTransactionEntitlementsServer, getMyTransactionOrdersServer, getUserProfileAddressServer } from "@/lib/api/me.server";
import { PurchaseHistory } from "@/components/layout/backend/billing/purchase-history";
import { CreditPricing } from "@/components/layout/backend/billing/credit-pricing";
import { Separator } from "@/components/ui/separator";
import {
  TransactionHistory,
  TableSkeleton,
} from "@/components/layout/backend/billing/transaction-history";
import { BillingClientWrapper } from "./client-wrapper";
import { SubscriptionBillingClientWrapper } from "./subscription-client-wrapper";
import { SubscriptionPricing } from "@/components/layout/backend/billing/subscription-pricing";
import { SubscriptionStatus } from "@/components/layout/backend/billing/subscription-status";
import { SubscriptionHistory } from "@/components/layout/backend/billing/subscription-history";
import type { CheckoutAddressInput } from "@/lib/api/me";
import { TransactionBillingPortal } from "@/components/layout/backend/billing/transaction-billing-portal";

type BillingPageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type CheckoutOutcome = "success" | "cancel" | null;

type BillingAddressOption = CheckoutAddressInput & {
  id: string;
  label: string;
};

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

export default async function BillingPage({ params, searchParams }: BillingPageProps) {
  const { locale } = (await params) ?? { locale: "en" };
  const session = await getServerSession();
  if (!session?.user) {
    redirect("/login");
  }

  const resolvedSearchParams = await searchParams;
  const checkoutOutcome = getCheckoutOutcome(resolvedSearchParams);
  const t = await getTranslations("billing");
  const applicationConfig = await getMyApplicationConfigServer();

  if (applicationConfig.billing.transactionSurfacesEnabled) {
    const [basket, orders, entitlements] = await Promise.all([
      getMyTransactionBasketServer(),
      getMyTransactionOrdersServer(),
      getMyTransactionEntitlementsServer(),
    ]);

    return (
      <TransactionBillingPortal
        userId={session.user.id}
        initialBasket={basket}
        initialOrders={orders}
        initialEntitlements={entitlements}
      />
    );
  }

  if (applicationConfig.billing.subscriptionSurfacesEnabled) {
    return <SubscriptionBillingPage checkoutOutcome={checkoutOutcome} locale={locale} />;
  }

  if (!applicationConfig.billing.creditSurfacesEnabled) {
    return null;
  }

  const addresses = await getBillingAddressOptions(locale);

  return (
    <BillingClientWrapper addresses={addresses} checkoutOutcome={checkoutOutcome}>
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

async function getBillingAddressOptions(locale: string): Promise<BillingAddressOption[]> {
  const profile = await getUserProfileAddressServer();

  if (!profile) {
    return [];
  }

  const { street, number, zipcode, town, countryId } = profile;

  if (!street || !number || !zipcode || !town || !countryId) {
    return [];
  }

  const countryLocale = locale === "fr" || locale === "nl" ? locale : "en";
  const countries = await getCountriesServer(countryLocale).catch(() => []);
  const countryName = countries.find((country) => country.id === countryId)?.name;
  const addressLine = `${street} ${number}, ${zipcode} ${town}`;

  return [{
    id: "profile",
    label: countryName ? `${addressLine}, ${countryName}` : addressLine,
    street,
    number,
    zipcode,
    town,
    countryId,
  }];
}

async function SubscriptionBillingPage({ checkoutOutcome, locale }: { checkoutOutcome: CheckoutOutcome; locale: string }) {
  const t = await getTranslations("billing");
  const subscriptionT = await getTranslations("billing.subscription");
  const [subscription, payments, addresses] = await Promise.all([
    getMySubscriptionServer(),
    getMySubscriptionPaymentsServer(50),
    getBillingAddressOptions(locale),
  ]);

  return (
    <SubscriptionBillingClientWrapper addresses={addresses} checkoutOutcome={checkoutOutcome}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{subscriptionT("description")}</p>
        </div>

        <SubscriptionStatus subscription={subscription} />
        <SubscriptionPricing />
        <SubscriptionHistory payments={payments} />
      </div>
    </SubscriptionBillingClientWrapper>
  );
}

async function PurchaseHistoryWrapper() {
  const purchases = await getCreditPurchasesServer(50);

  return <PurchaseHistory purchases={purchases} />;
}
