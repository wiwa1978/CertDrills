"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { RuntimeApplicationSettingKey, RuntimeApplicationSettingsPayload } from "@platform/contracts/ts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { resetAdminApplicationSettingApi, updateAdminApplicationSettingApi } from "@/lib/api/admin";
import { adminQueryKeys } from "@/lib/query/keys";

type RuntimeSettingsCardProps = {
  settings: RuntimeApplicationSettingsPayload;
};

export function RuntimeSettingsCard({ settings }: RuntimeSettingsCardProps) {
  const t = useTranslations("admin.system.runtimeSettings");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(settings.definitions.map((definition) => [definition.key, String(settings.effective[definition.key])]))
  );
  const [adminSecret, setAdminSecret] = React.useState("");

  React.useEffect(() => {
    setValues(Object.fromEntries(settings.definitions.map((definition) => [definition.key, String(settings.effective[definition.key])])));
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: updateAdminApplicationSettingApi,
    onSuccess: async () => {
      toast.success(t("updateSuccess"));
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.applicationConfig });
      router.refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("updateError")),
  });

  const resetMutation = useMutation({
    mutationFn: resetAdminApplicationSettingApi,
    onSuccess: async () => {
      toast.success(t("resetSuccess"));
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.applicationConfig });
      router.refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("resetError")),
  });

  function saveSetting(key: RuntimeApplicationSettingKey) {
    const value = Number(values[key]);
    if (!Number.isInteger(value)) {
      toast.error(t("integerError"));
      return;
    }

    updateMutation.mutate({ key, value, secret: adminSecret.trim() });
  }

  function resetSetting(key: RuntimeApplicationSettingKey) {
    resetMutation.mutate({ key, secret: adminSecret.trim() });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="max-w-sm space-y-2">
          <Label htmlFor="runtime-settings-admin-secret">{t("adminSecret")}</Label>
          <Input
            id="runtime-settings-admin-secret"
            type="password"
            value={adminSecret}
            onChange={(event) => setAdminSecret(event.target.value)}
            placeholder={t("adminSecretPlaceholder")}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {settings.definitions.map((definition) => {
            const hasOverride = settings.overrides[definition.key] !== undefined;
            return (
              <div key={definition.key} className="space-y-4 rounded-lg border p-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-medium">{t(definition.labelKey)}</h3>
                    <Badge variant={hasOverride ? "default" : "secondary"}>
                      {hasOverride ? t("overrideBadge") : t("defaultBadge")}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{t(definition.descriptionKey)}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`runtime-setting-${definition.key}`}>{t("value")}</Label>
                  <Input
                    id={`runtime-setting-${definition.key}`}
                    type="number"
                    min={definition.min}
                    max={definition.max}
                    value={values[definition.key] ?? ""}
                    onChange={(event) => setValues((current) => ({ ...current, [definition.key]: event.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">{t("sourceValue", { value: definition.sourceValue })}</p>
                  <p className="text-xs text-muted-foreground">{t("range", { min: definition.min, max: definition.max })}</p>
                </div>

                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => saveSetting(definition.key)} disabled={updateMutation.isPending || adminSecret.trim().length === 0}>
                    {t("save")}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => resetSetting(definition.key)} disabled={resetMutation.isPending || adminSecret.trim().length === 0 || !hasOverride}>
                    {t("reset")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
