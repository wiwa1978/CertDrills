"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { subscriptionPlans } from "@/config/billing";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useSubscriptionBilling } from "@/app/[locale]/(backend)/billing/subscription-client-wrapper";

export function SubscriptionPricing() {
  const { handleSelectPlan } = useSubscriptionBilling();
  const t = useTranslations("billing.subscription");

  return (
    <div className={cn("grid gap-6", subscriptionPlans.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
      {subscriptionPlans.map((plan) => {
        const isPopular = "popular" in plan && plan.popular;
        const price = plan.price / 100;

        return (
          <Card key={plan.key} className={cn("relative flex flex-col", isPopular && "border-primary shadow-lg")}>
            {isPopular ? (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                  {t("mostPopular")}
                </span>
              </div>
            ) : null}
            <CardHeader className="text-center">
              <CardTitle className="text-xl capitalize">{plan.key}</CardTitle>
              <CardDescription>{t("planDescription", { interval: plan.interval })}</CardDescription>
              <div className="mt-4">
                <span className="text-4xl font-bold">€{price}</span>
                <span className="text-muted-foreground">/{plan.interval}</span>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="h-5 w-5 shrink-0 text-primary" />
                    <span className="text-sm text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onClick={() => void handleSelectPlan(plan.key)}>
                {t("choosePlan", { plan: plan.key })}
              </Button>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
