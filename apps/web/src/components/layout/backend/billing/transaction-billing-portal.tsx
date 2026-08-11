"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import type { TransactionBasket, TransactionEntitlement, TransactionOrder } from "@platform/contracts";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { transactionProducts } from "@/config/billing";
import { useTransactionCart } from "@/components/providers/transaction-cart-provider";
import { TransactionEntitlements } from "./transaction-entitlements";
import { TransactionOrders } from "./transaction-orders";
import { TransactionProductCatalog } from "./transaction-product-catalog";

type TransactionBillingPortalProps = {
  userId: string;
  initialBasket: TransactionBasket;
  initialOrders: TransactionOrder[];
  initialEntitlements: TransactionEntitlement[];
};

export function TransactionBillingPortal(props: TransactionBillingPortalProps) {
  return <TransactionBillingPortalContent key={props.userId} {...props} />;
}

function TransactionBillingPortalContent({ userId, initialBasket, initialOrders, initialEntitlements }: TransactionBillingPortalProps) {
  const t = useTranslations("billing.transaction");
  const cart = useTransactionCart();
  const seedBasket = cart.seedBasket;
  const userMatchesProvider = cart.providerUserId === userId;
  const catalogEnabled = cart.enabled && userMatchesProvider;

  useEffect(() => {
    if (catalogEnabled) seedBasket(initialBasket);
  }, [catalogEnabled, initialBasket, seedBasket]);

  return (
    <div className="space-y-10">
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {catalogEnabled && cart.basketFetching ? t("loading") : ""}
      </p>
      <header className="max-w-3xl space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </header>

      {catalogEnabled && cart.basketError && cart.basketHasData ? (
        <Alert variant="destructive">
          <AlertDescription>{t("errors.basketQuery")}</AlertDescription>
        </Alert>
      ) : null}
      <TransactionProductCatalog
        products={transactionProducts}
        quantities={catalogEnabled ? cart.quantities : {}}
        pending={!catalogEnabled || cart.mutationPending || cart.checkoutPending}
        onQuantityChange={(productKey, quantity) => {
          if (catalogEnabled) cart.changeCatalogQuantity(productKey, quantity);
        }}
        onSubmit={(productKey, quantity) => {
          if (catalogEnabled) cart.upsert(productKey, quantity);
        }}
      />

      <TransactionOrders orders={initialOrders} />
      <TransactionEntitlements entitlements={initialEntitlements} />
    </div>
  );
}
