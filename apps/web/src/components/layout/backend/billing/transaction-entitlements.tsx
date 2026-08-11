import type { TransactionEntitlement } from "@platform/contracts";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { transactionProducts } from "@/config/billing";

export function TransactionEntitlements({ entitlements }: { entitlements: TransactionEntitlement[] }) {
  const t = useTranslations("billing.transaction");

  return (
    <section aria-labelledby="transaction-entitlements-heading" className="space-y-4">
      <div>
        <h2 id="transaction-entitlements-heading" className="text-xl font-semibold">{t("entitlements.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("entitlements.description")}</p>
      </div>
      {entitlements.length === 0 ? <p className="rounded-xl border p-6 text-sm text-muted-foreground">{t("entitlements.empty")}</p> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entitlements.map((entitlement) => {
            const product = transactionProducts.find((item) => item.key === entitlement.productKey);
            const productName = product ? t(`products.${product.key}.name`) : entitlement.productKey;
            const status = t(`entitlements.statuses.${entitlement.status}`);
            return (
              <Card key={entitlement.id}>
                <CardHeader className="grid-cols-[1fr_auto]">
                  <CardTitle>{productName}</CardTitle>
                  <Badge variant={entitlement.status === "available" ? "default" : "secondary"} aria-label={t("entitlements.status", { status })}>{status}</Badge>
                </CardHeader>
                <CardContent className="space-y-1 text-xs text-muted-foreground">
                  <p>{t("entitlements.order", { id: entitlement.orderId })}</p>
                  <p>{t("entitlements.created", { date: entitlement.createdAt.slice(0, 10) })}</p>
                  {entitlement.consumedAt ? <p>{t("entitlements.consumed", { date: entitlement.consumedAt.slice(0, 10) })}</p> : null}
                  {entitlement.refundedAt ? <p>{t("entitlements.refunded", { date: entitlement.refundedAt.slice(0, 10) })}</p> : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
