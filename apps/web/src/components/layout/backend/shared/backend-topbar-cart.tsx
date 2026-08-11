"use client";

import { useId } from "react";
import { ShoppingCart } from "lucide-react";
import { useTranslations } from "next-intl";

import { TransactionBasketContent } from "@/components/layout/backend/billing/transaction-basket";
import { useTransactionCart } from "@/components/providers/transaction-cart-provider";
import type { TransactionCartContextValue } from "@/components/providers/transaction-cart-provider";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useSession } from "@/lib/auth-client";

export function BackendTopbarCart() {
  const { data: session } = useSession();
  const cart = useTransactionCart();
  const t = useTranslations("billing.transaction");
  const headingId = useId();

  return <BackendTopbarCartView cart={cart} hasLiveUser={Boolean(session?.user)} headingId={headingId} t={t} />;
}

type CartTranslator = ReturnType<typeof useTranslations<"billing.transaction">>;

export function BackendTopbarCartView({
  cart,
  hasLiveUser,
  headingId,
  t,
}: {
  cart: TransactionCartContextValue;
  hasLiveUser: boolean;
  headingId: string;
  t: CartTranslator;
}) {

  if (!cart.enabled || !hasLiveUser) return null;

  const triggerLabel = cart.totalQuantity > 0
    ? t("basket.triggerLabelWithCount", { count: cart.totalQuantity })
    : t("basket.triggerLabel");

  return (
    <Sheet open={cart.open} onOpenChange={cart.setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="relative" aria-label={triggerLabel}>
          <ShoppingCart aria-hidden="true" />
          {cart.totalQuantity > 0 ? (
            <span
              data-cart-badge="true"
              aria-hidden="true"
              className="pointer-events-none absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground"
            >
              {cart.totalQuantity > 99 ? "99+" : cart.totalQuantity}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" closeLabel={t("basket.close")} className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b pr-12">
          <SheetTitle>{t("basket.title")}</SheetTitle>
          <SheetDescription>{t("basket.description")}</SheetDescription>
        </SheetHeader>
        <TransactionBasketContent
          basket={cart.basket}
          pending={cart.mutationPending}
          checkoutPending={cart.checkoutPending}
          error={cart.basketError}
          fetching={cart.basketFetching}
          hasData={cart.basketHasData}
          onRetry={cart.retryBasket}
          showTitle={false}
          headingId={headingId}
          onQuantityChange={cart.change}
          onRemove={cart.remove}
          onClear={cart.clear}
          onCheckout={cart.checkout}
        />
      </SheetContent>
    </Sheet>
  );
}
