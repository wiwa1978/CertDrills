import type { TransactionOrder } from "@platform/contracts";
import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { transactionProducts } from "@/config/billing";
import { formatTransactionMoney } from "./transaction-product-catalog";

export function TransactionOrders({ orders }: { orders: TransactionOrder[] }) {
  const locale = useLocale();
  const t = useTranslations("billing.transaction");

  return (
    <section aria-labelledby="transaction-orders-heading" className="space-y-4">
      <div>
        <h2 id="transaction-orders-heading" className="text-xl font-semibold">{t("orders.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("orders.description")}</p>
      </div>
      {orders.length === 0 ? <p className="rounded-xl border p-6 text-sm text-muted-foreground">{t("orders.empty")}</p> : (
        <div className="grid gap-4 md:grid-cols-2">
          {orders.map((order) => {
            const status = t(`orders.statuses.${order.status}`);
            return <Card key={order.id}>
              <CardHeader className="grid-cols-[1fr_auto]">
                <div className="space-y-1">
                  <CardTitle>{t("orders.order", { id: order.id })}</CardTitle>
                  <p className="text-xs text-muted-foreground">{t("orders.date", { date: order.createdAt.slice(0, 10) })}</p>
                </div>
                <Badge variant="outline" aria-label={t("orders.status", { status })}>{status}</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-1 text-sm">
                  {order.items.map((item) => {
                    const product = transactionProducts.find(({ key }) => key === item.productKey);
                    const productName = product ? t(`products.${product.key}.name`) : item.name || item.productKey;
                    return <li key={item.id} className="flex justify-between gap-4"><span>{productName} - {t("orders.quantity", { quantity: item.quantity })}</span><span>{formatTransactionMoney(item.totalAmount, item.currency, locale)}</span></li>;
                  })}
                </ul>
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t pt-4 text-sm">
                  <dt>{t("orders.subtotal")}</dt><dd>{formatTransactionMoney(order.subtotalAmount, order.currency, locale)}</dd>
                  <dt>{t("orders.tax")}</dt><dd>{formatTransactionMoney(order.taxAmount, order.currency, locale)}</dd>
                  <dt className="font-semibold">{t("orders.total")}</dt><dd className="font-semibold">{formatTransactionMoney(order.totalAmount, order.currency, locale)}</dd>
                </dl>
                {order.paymentId ? <p className="break-all text-xs text-muted-foreground">{t("orders.payment", { id: order.paymentId })}</p> : null}
              </CardContent>
            </Card>;
          })}
        </div>
      )}
    </section>
  );
}
