"use client";

import { Minus, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { TransactionProduct } from "@/config/billing";

type TransactionProductCatalogProps = {
  products: readonly TransactionProduct[];
  quantities: Record<string, number>;
  pending: boolean;
  onQuantityChange: (productKey: string, quantity: number) => void;
  onSubmit: (productKey: string, quantity: number) => void;
};

export const TRANSACTION_QUANTITY_MIN = 1;
export const TRANSACTION_QUANTITY_MAX = 100;

export function formatTransactionMoney(amount: number, currency: string, locale = "en") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount / 100);
}

export function TransactionProductCatalog({ products, quantities, pending, onQuantityChange, onSubmit }: TransactionProductCatalogProps) {
  const locale = useLocale();
  const t = useTranslations("billing.transaction");
  const activeProducts = products.filter((product) => product.active);

  return (
    <section aria-labelledby="transaction-catalog-heading" className="space-y-4">
      <div>
        <h2 id="transaction-catalog-heading" className="text-xl font-semibold">{t("catalog.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("catalog.description")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {activeProducts.map((product) => {
          const quantity = Math.min(TRANSACTION_QUANTITY_MAX, Math.max(TRANSACTION_QUANTITY_MIN, quantities[product.key] ?? TRANSACTION_QUANTITY_MIN));
          const productName = t(`products.${product.key}.name`);
          return (
            <Card key={product.key} className="justify-between">
              <CardHeader>
                <CardTitle>{productName}</CardTitle>
                <CardDescription>{t(`products.${product.key}.description`)}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{formatTransactionMoney(product.price, product.currency, locale)}</p>
                <p className="text-xs text-muted-foreground">{t("catalog.preTax")}</p>
              </CardContent>
              <CardFooter className="flex-wrap justify-between gap-3">
                <div className="flex items-center gap-1 rounded-md border p-1">
                  <Button type="button" variant="ghost" size="icon-sm" disabled={pending || quantity <= TRANSACTION_QUANTITY_MIN} aria-label={t("catalog.decreaseQuantity", { product: productName })} onClick={() => onQuantityChange(product.key, Math.max(TRANSACTION_QUANTITY_MIN, quantity - 1))}>
                    <Minus aria-hidden="true" />
                  </Button>
                  <span className="min-w-8 text-center tabular-nums">
                    <span aria-hidden="true">{quantity}</span>
                    <span className="sr-only">{t("catalog.quantityLabel", { product: productName, quantity })}</span>
                  </span>
                  <Button type="button" variant="ghost" size="icon-sm" disabled={pending || quantity >= TRANSACTION_QUANTITY_MAX} aria-label={t("catalog.increaseQuantity", { product: productName })} onClick={() => onQuantityChange(product.key, Math.min(TRANSACTION_QUANTITY_MAX, quantity + 1))}>
                    <Plus aria-hidden="true" />
                  </Button>
                </div>
                <Button type="button" disabled={pending} onClick={() => onSubmit(product.key, quantity)}>{t("catalog.addOrUpdate")}</Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
