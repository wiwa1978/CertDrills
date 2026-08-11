"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { creditPackages } from "@/config/billing";
import { useBilling } from "@/app/[locale]/(backend)/billing/client-wrapper";

interface CreditPricingProps {
  showContainer?: boolean;
  onPurchase?: (packageKey: string) => void;
  purchaseButtonText?: string;
}

export function CreditPricing({
  showContainer = true,
  onPurchase,
  purchaseButtonText,
}: CreditPricingProps) {
  const t = useTranslations("creditPricing");
  const { handlePurchase } = useBilling();

  const content = (
    <>
      <div className="text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t("title")}
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          {t("description")}
        </p>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {creditPackages.map((pkg) => {
          const totalCredits = pkg.credits + ("bonus" in pkg ? pkg.bonus : 0);
          const priceInEuro = pkg.price / 100;
          const isPopular = "popular" in pkg && pkg.popular;

          return (
            <Card
              key={pkg.key}
              className={cn(
                "relative flex flex-col",
                isPopular && "border-primary shadow-lg"
              )}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                    {t("mostPopular")}
                  </span>
                </div>
              )}
              <CardHeader className="text-center">
                <CardTitle className="text-xl capitalize">
                  {t(`packages.${pkg.key}.name`)}
                </CardTitle>
                <CardDescription className="mt-2">
                  {t(`packages.${pkg.key}.description`)}
                </CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold">€{priceInEuro}</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 shrink-0 text-primary" />
                    <span className="text-sm text-muted-foreground">
                      {t("features.credits", { count: pkg.credits })}
                    </span>
                  </li>
                  {"bonus" in pkg && pkg.bonus > 0 && (
                    <li className="flex items-start gap-3">
                      <Check className="h-5 w-5 shrink-0 text-green-600" />
                      <span className="text-sm font-medium text-green-600">
                        {t("features.bonus", { count: pkg.bonus })}
                      </span>
                    </li>
                  )}
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 shrink-0 text-primary" />
                    <span className="text-sm text-muted-foreground">
                      {t("features.total", { count: totalCredits })}
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 shrink-0 text-primary" />
                    <span className="text-sm text-muted-foreground">
                      {t("features.noExpiry")}
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 shrink-0 text-primary" />
                    <span className="text-sm text-muted-foreground">
                      {t("features.instantActivation")}
                    </span>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  variant={isPopular ? "default" : "outline"}
                  onClick={() => onPurchase ? onPurchase(pkg.key) : handlePurchase(pkg.key)}
                >
                  {purchaseButtonText || t(`packages.${pkg.key}.cta`)}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </>
  );

  if (showContainer) {
    return (
      <section id="pricing" className="py-16 md:py-24">
        <Container>{content}</Container>
      </section>
    );
  }

  return content;
}
