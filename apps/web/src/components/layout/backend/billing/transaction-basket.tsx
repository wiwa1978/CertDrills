"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { TransactionBasket } from "@platform/contracts";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { transactionProducts } from "@/config/billing";
import { formatTransactionMoney, TRANSACTION_QUANTITY_MAX, TRANSACTION_QUANTITY_MIN } from "./transaction-product-catalog";

type TransactionBasketContentProps = {
  basket: TransactionBasket;
  pending: boolean;
  checkoutPending: boolean;
  error?: boolean;
  fetching?: boolean;
  hasData?: boolean;
  onRetry?: () => void;
  showTitle?: boolean;
  headingId: string;
  onQuantityChange: (productKey: string, quantity: number) => void;
  onRemove: (productKey: string) => void;
  onClear: () => void;
  onCheckout: () => void;
};

export function TransactionBasketContent({
  basket,
  pending,
  checkoutPending,
  error = false,
  fetching = false,
  hasData = true,
  onRetry,
  showTitle = true,
  headingId,
  onQuantityChange,
  onRemove,
  onClear,
  onCheckout,
}: TransactionBasketContentProps) {
  const locale = useLocale();
  const t = useTranslations("billing.transaction");
  const disabled = pending || checkoutPending;

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-labelledby={headingId}>
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-3">
        <h3 id={headingId} className={showTitle ? "font-semibold" : "sr-only"}>{t("basket.title")}</h3>
        {hasData ? <Button type="button" variant="ghost" size="sm" disabled={disabled || basket.items.length === 0} onClick={onClear}>{t("basket.clear")}</Button> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {error ? (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>
              <p>{t(hasData ? "errors.basketQuery" : "errors.basketQueryInitial")}</p>
              <Button type="button" variant="outline" size="sm" disabled={fetching} aria-busy={fetching} onClick={onRetry}>{t("basket.retry")}</Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {!hasData && fetching && !error ? (
          <p role="status" className="py-6 text-center text-sm text-muted-foreground">{t("basket.loading")}</p>
        ) : hasData && basket.items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("basket.empty")}</p>
        ) : hasData ? (
          <div className="space-y-4 pb-4">
            {basket.items.map((item) => {
              const product = transactionProducts.find(({ key }) => key === item.productKey);
              const productName = product ? t(`products.${product.key}.name`) : item.name || item.productKey;
              return <div key={item.id} className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{productName}</p>
                    <p className="text-sm text-muted-foreground">{formatTransactionMoney(item.totalAmount, item.currency, locale)}</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={t("basket.remove", { product: productName })} onClick={() => onRemove(item.productKey)}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="outline" size="icon-sm" disabled={disabled || item.quantity <= TRANSACTION_QUANTITY_MIN} aria-label={t("basket.decreaseQuantity", { product: productName })} onClick={() => onQuantityChange(item.productKey, Math.max(TRANSACTION_QUANTITY_MIN, item.quantity - 1))}>
                    <Minus aria-hidden="true" />
                  </Button>
                  <span className="min-w-8 text-center tabular-nums">
                    <span aria-hidden="true">{item.quantity}</span>
                    <span className="sr-only">{t("basket.quantityLabel", { product: productName, quantity: item.quantity })}</span>
                  </span>
                  <Button type="button" variant="outline" size="icon-sm" disabled={disabled || item.quantity >= TRANSACTION_QUANTITY_MAX} aria-label={t("basket.increaseQuantity", { product: productName })} onClick={() => onQuantityChange(item.productKey, Math.min(TRANSACTION_QUANTITY_MAX, item.quantity + 1))}>
                    <Plus aria-hidden="true" />
                  </Button>
                </div>
              </div>;
            })}
          </div>
        ) : null}
      </div>

      {hasData ? <div className="mt-auto shrink-0 space-y-4 px-4 pb-4 pt-3">
        <Separator />
        <div className="flex items-center justify-between font-medium">
          <span>{t("basket.subtotal")}</span>
          <span className="tabular-nums">{basket.currency ? formatTransactionMoney(basket.totalAmount, basket.currency, locale) : "-"}</span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{t("basket.taxNote")}</p>
        <Button type="button" className="w-full" disabled={disabled || basket.items.length === 0} onClick={onCheckout}>
          {checkoutPending ? t("basket.checkoutPending") : t("basket.checkout")}
        </Button>
      </div> : null}
    </section>
  );
}
