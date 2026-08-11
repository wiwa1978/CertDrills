"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { redeemVoucher } from "@/lib/services/credits";
import { webQueryKeys } from "@/lib/query/keys";

export function RedeemVoucherCard() {
  const t = useTranslations("billing.vouchers");
  const queryClient = useQueryClient();
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const redeemMutation = useMutation({
    mutationFn: redeemVoucher,
    onSuccess: async (result) => {
      if (!result.success || typeof result.creditsAdded !== "number") {
        setError(result.error ?? t("error"));
        return;
      }

      setError(null);
      setCode("");
      toast.success(t("success", { credits: result.creditsAdded }));

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: webQueryKeys.creditBalance }),
        queryClient.invalidateQueries({ queryKey: webQueryKeys.notifications(20) }),
        queryClient.invalidateQueries({ queryKey: webQueryKeys.unreadNotifications }),
      ]);
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : t("error"));
    },
  });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!code.trim()) {
      setError(t("error"));
      return;
    }

    await redeemMutation.mutateAsync(code.trim().toUpperCase());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder={t("form.codePlaceholder")}
            className="font-mono uppercase"
            disabled={redeemMutation.isPending}
          />
          <Button type="submit" disabled={redeemMutation.isPending}>
            {redeemMutation.isPending ? t("form.redeeming") : t("form.submit")}
          </Button>
        </form>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
