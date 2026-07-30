import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SubscriptionPlanDistributionPoint } from "@platform/contracts";
import { getTranslations } from "next-intl/server";

type SubscriptionPlanDistributionProps = {
  distribution: SubscriptionPlanDistributionPoint[];
};

export async function SubscriptionPlanDistribution({ distribution }: SubscriptionPlanDistributionProps) {
  const t = await getTranslations("admin.billing.subscriptionsMode");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("planDistribution.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {distribution.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("planDistribution.empty")}</p>
        ) : (
          <div className="space-y-3">
            {distribution.map((entry) => (
              <div key={entry.planKey} className="flex items-center justify-between rounded-lg border p-3">
                <span className="font-medium capitalize">{entry.planKey}</span>
                <span className="text-sm text-muted-foreground">
                  {t("planDistribution.count", { count: entry.count })}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
