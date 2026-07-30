import type { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import type { UserSubscription } from "@platform/contracts";

type SubscriptionsTableProps = {
  subscriptions: UserSubscription[];
  t: ReturnType<typeof useTranslations>;
};

function statusVariant(status: UserSubscription["status"]) {
  if (status === "active" || status === "trialing") {
    return "default";
  }

  if (status === "past_due" || status === "paused") {
    return "secondary";
  }

  return "outline";
}

export function SubscriptionsTable({ subscriptions, t }: SubscriptionsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("subscriptions.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("subscriptions.table.user")}</TableHead>
              <TableHead>{t("subscriptions.table.plan")}</TableHead>
              <TableHead>{t("subscriptions.table.status")}</TableHead>
              <TableHead>{t("subscriptions.table.periodEnd")}</TableHead>
              <TableHead>{t("subscriptions.table.subscriptionId")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subscriptions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {t("subscriptions.empty")}
                </TableCell>
              </TableRow>
            ) : (
              subscriptions.map((subscription) => (
                <TableRow key={subscription.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{subscription.userName ?? t("subscriptions.unknownUser")}</span>
                      <span className="text-xs text-muted-foreground">{subscription.userEmail ?? "-"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">{subscription.planKey}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(subscription.status)}>{t(`subscriptions.status.${subscription.status}`)}</Badge>
                    {subscription.cancelAtPeriodEnd ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {t("subscriptions.cancelsAtPeriodEnd")}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {subscription.currentPeriodEnd ? formatDateTime(subscription.currentPeriodEnd) : "-"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{subscription.providerSubscriptionId}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
