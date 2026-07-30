"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useSubscriptionBilling } from "@/app/[locale]/(backend)/billing/subscription-client-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SubscriptionDiscountForm() {
  const t = useTranslations("billing.subscription.discount");
  const { appliedDiscountCode, setAppliedDiscountCode } = useSubscriptionBilling();
  const [discountCode, setDiscountCode] = React.useState(appliedDiscountCode ?? "");

  function applyDiscountCode() {
    const normalizedCode = discountCode.trim().toUpperCase();
    if (!normalizedCode) {
      setAppliedDiscountCode(null);
      return;
    }

    setAppliedDiscountCode(normalizedCode);
    setDiscountCode(normalizedCode);
    toast.success(t("applied", { code: normalizedCode }));
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <label className="text-sm font-medium" htmlFor="subscription-discount-code">
            {t("label")}
          </label>
          <Input
            id="subscription-discount-code"
            value={discountCode}
            onChange={(event) => {
              setDiscountCode(event.target.value.toUpperCase());
              setAppliedDiscountCode(null);
            }}
            placeholder={t("placeholder")}
          />
        </div>
        <Button type="button" variant="secondary" onClick={applyDiscountCode} disabled={discountCode.trim().length === 0}>
          {t("apply")}
        </Button>
      </div>
      {appliedDiscountCode ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {t("appliedDescription", { code: appliedDiscountCode })}
        </p>
      ) : null}
    </div>
  );
}
