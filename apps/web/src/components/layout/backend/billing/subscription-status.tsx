import type { UserSubscription } from "@platform/contracts";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/utils";

export async function SubscriptionStatus({ subscription }: { subscription: UserSubscription | null }) {
  const t = await getTranslations("billing.subscription");

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>{t("currentTitle")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {subscription ? t("managedThroughPortal") : t("noActive")}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/billing">{t("upgrade")}</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {subscription ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">{t("planLabel")}</p>
              <p className="font-medium capitalize">{subscription.planKey}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("statusLabel")}</p>
              <Badge variant={subscription.status === "active" || subscription.status === "trialing" ? "default" : "secondary"}>
                {subscription.status}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("renewsLabel")}</p>
              <p className="font-medium">
                {subscription.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd) : t("unknownPeriod")}
              </p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
