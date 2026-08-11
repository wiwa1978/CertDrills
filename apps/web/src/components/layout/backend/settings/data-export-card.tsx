"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileJson, Loader2, RefreshCw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  cancelMyDataExport,
  createMyDataExport,
  downloadMyDataExport,
  listMyDataExports,
  type UserDataExportSummary,
} from "@/lib/api/me";
import { webQueryKeys } from "@/lib/query/keys";

type ExportWithToken = UserDataExportSummary & { downloadToken?: string };

function formatBytes(value: number | null) {
  if (!value) return null;
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

export function DataExportCard() {
  const t = useTranslations("settings.dataExport");
  const queryClient = useQueryClient();
  const [downloadTokens, setDownloadTokens] = React.useState<Record<string, string>>({});
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);
  const exportsQuery = useQuery({
    queryKey: webQueryKeys.dataExports,
    queryFn: () => listMyDataExports() as Promise<ExportWithToken[]>,
  });
  const requestMutation = useMutation({
    mutationFn: createMyDataExport,
    onSuccess: async (result) => {
      if (!result.success || !result.data) {
        toast.error(result.error ?? t("failed"));
        return;
      }
      const data = result.data;
      setDownloadTokens((current) => ({ ...current, [data.id]: data.downloadToken }));
      await queryClient.invalidateQueries({ queryKey: webQueryKeys.dataExports });
      toast.success(t("success"));
    },
    onError: () => toast.error(t("failed")),
  });
  const cancelMutation = useMutation({
    mutationFn: cancelMyDataExport,
    onSuccess: async (result) => {
      if (!result.success || !result.data) {
        toast.error(result.error ?? t("cancelFailed"));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: webQueryKeys.dataExports });
      toast.success(t("cancelSuccess"));
    },
    onError: () => toast.error(t("cancelFailed")),
  });

  const handleRequest = async () => {
    await requestMutation.mutateAsync();
  };

  const handleCancel = async (exportId: string) => {
    await cancelMutation.mutateAsync(exportId);
  };

  const exports = (exportsQuery.data ?? []).map((item) => ({
    ...item,
    downloadToken: downloadTokens[item.id],
  }));
  const activeExport = exports.find((item) => item.status === "pending" || item.status === "ready");

  const handleDownload = async (item: ExportWithToken) => {
    if (!item.downloadToken) return;
    setDownloadingId(item.id);
    try {
      const blob = await downloadMyDataExport(item.id, item.downloadToken);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = item.fileName ?? `user-data-export-${item.id}.json`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      setDownloadTokens((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: webQueryKeys.dataExports });
    } catch {
      toast.error(t("failed"));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileJson className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <CardTitle>{t("title")}</CardTitle>
        </div>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {exportsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t("loading")}
          </div>
        ) : exports.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          exports.slice(0, 3).map((item) => {
            const canDownload = item.status === "ready" && item.downloadToken;
            const canCancel = item.status === "pending" || item.status === "ready";

            return (
              <div key={item.id} className="rounded-md border bg-muted/30 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">{t(`status.${item.status}`)}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.createdAt ? t("createdAt", { date: new Date(item.createdAt).toLocaleDateString() }) : t("createdUnknown")}
                      {formatBytes(item.fileSizeBytes) ? ` · ${formatBytes(item.fileSizeBytes)}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {canDownload && (
                      <Button
                        size="sm"
                        disabled={downloadingId === item.id}
                        onClick={() => void handleDownload(item)}
                      >
                        {downloadingId === item.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                        )}
                        {t("downloadButton")}
                      </Button>
                    )}
                    {canCancel && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={cancelMutation.variables === item.id && cancelMutation.isPending}
                        onClick={() => void handleCancel(item.id)}
                      >
                        {cancelMutation.variables === item.id && cancelMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <X className="mr-2 h-4 w-4" aria-hidden="true" />
                        )}
                        {t("cancelButton")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap gap-3">
        <Button onClick={handleRequest} disabled={requestMutation.isPending || !!activeExport}>
          {requestMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {requestMutation.isPending ? t("requesting") : t("requestButton")}
        </Button>
        <Button variant="outline" onClick={() => void queryClient.invalidateQueries({ queryKey: webQueryKeys.dataExports })} disabled={exportsQuery.isLoading}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("refreshButton")}
        </Button>
      </CardFooter>
    </Card>
  );
}
