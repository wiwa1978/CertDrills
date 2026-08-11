"use client";

import * as React from "react";
import { ArrowUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { formatDateTime } from "@/lib/utils";
import type { NotificationSendHistoryItem } from "@platform/contracts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface NotificationHistoryTableProps {
  notifications: NotificationSendHistoryItem[];
  loading?: boolean;
}

export function NotificationHistoryTable({
  notifications,
  loading = false,
}: NotificationHistoryTableProps) {
  const t = useTranslations("admin.notifications.history");
  const [selectedNotification, setSelectedNotification] = React.useState<NotificationSendHistoryItem | null>(null);

  const getScopeBadge = (scope: NotificationSendHistoryItem["scope"]) => {
    return scope === "all" ? <Badge variant="default">All</Badge> : <Badge variant="secondary">Selected</Badge>;
  };

  const columns: ColumnDef<NotificationSendHistoryItem>[] = [
    {
      accessorKey: "title",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          {t("table.title")}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <button
          onClick={() => setSelectedNotification(row.original)}
          className="flex items-center gap-2 hover:bg-muted/50 rounded-md px-2 py-2 w-full text-left transition-colors"
        >
          <span className="font-medium">{row.original.title}</span>
        </button>
      ),
    },
    {
      accessorKey: "scope",
      header: "Scope",
      cell: ({ row }) => getScopeBadge(row.original.scope),
    },
    {
      accessorKey: "sentCount",
      header: "Sent",
      cell: ({ row }) => <div className="text-sm">{row.original.sentCount}</div>,
    },
    {
      accessorKey: "skippedCount",
      header: "Skipped",
      cell: ({ row }) => <div className="text-sm">{row.original.skippedCount}</div>,
    },
    {
      accessorKey: "invalidRecipientCount",
      header: "Invalid",
      cell: ({ row }) => <div className="text-sm">{row.original.invalidRecipientCount}</div>,
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          {t("table.createdAt")}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-sm">
          {formatDateTime(row.original.createdAt)}
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={notifications}
        loading={loading}
        loadingText={t("loading")}
        emptyText={t("noNotifications")}
      />
      
      <Dialog open={!!selectedNotification} onOpenChange={(open) => !open && setSelectedNotification(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedNotification?.title}</DialogTitle>
            <DialogDescription>
              {t("description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Scope
                </label>
                <div className="mt-1">
                  {selectedNotification && getScopeBadge(selectedNotification.scope)}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Actor
                </label>
                <div className="mt-1 text-sm">
                  {selectedNotification?.actorId ?? "-"}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  {t("table.createdAt")}
                </label>
                <div className="mt-1 text-sm">
                  {selectedNotification && formatDateTime(selectedNotification.createdAt)}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Sent / Skipped / Invalid
                </label>
                <div className="mt-1 text-sm">
                  {selectedNotification
                    ? `${selectedNotification.sentCount} / ${selectedNotification.skippedCount} / ${selectedNotification.invalidRecipientCount}`
                    : "-"}
                </div>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Message
              </label>
              <div className="mt-1 text-sm p-3 bg-muted rounded-md">
                {selectedNotification?.message}
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <Button variant="outline" onClick={() => setSelectedNotification(null)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
