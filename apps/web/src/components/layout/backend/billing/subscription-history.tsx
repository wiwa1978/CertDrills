"use client";

import * as React from "react";
import { ArrowUpDown, Download, Receipt } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import type { SubscriptionPayment } from "@platform/contracts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadMySubscriptionInvoice } from "@/lib/api/me";
import { formatDate } from "@/lib/utils";

export function SubscriptionHistory({ payments }: { payments: SubscriptionPayment[] }) {
  const t = useTranslations("billing.subscription.history");
  const [downloadingInvoices, setDownloadingInvoices] = React.useState<Set<string>>(new Set());

  const handleDownloadInvoice = async (paymentId: string) => {
    setDownloadingInvoices((previous) => new Set(previous).add(paymentId));

    try {
      const result = await downloadMySubscriptionInvoice(paymentId);
      if (result.success && result.invoiceUrl) {
        window.open(result.invoiceUrl, "_blank");
        toast.success(t("invoiceDownloaded"));
      } else {
        toast.error(result.error ?? t("invoiceUnavailable"));
      }
    } catch {
      toast.error(t("invoiceFailed"));
    } finally {
      setDownloadingInvoices((previous) => {
        const next = new Set(previous);
        next.delete(paymentId);
        return next;
      });
    }
  };

  const columns: ColumnDef<SubscriptionPayment>[] = [
    {
      accessorKey: "planKey",
      header: ({ column }) => <SortableHeader label={t("table.plan")} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
      cell: ({ row }) => <span className="font-medium capitalize">{row.original.planKey}</span>,
    },
    {
      accessorKey: "priceInclVat",
      header: ({ column }) => <SortableHeader label={t("table.amount")} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">€{(row.original.priceInclVat / 100).toFixed(2)}</span>
          <span className="text-xs text-muted-foreground">{t("table.exclVat", { amount: (row.original.priceExclVat / 100).toFixed(2) })}</span>
        </div>
      ),
    },
    {
      accessorKey: "paymentStatus",
      header: ({ column }) => <SortableHeader label={t("table.status")} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
      cell: ({ row }) => <Badge variant={row.original.paymentStatus === "completed" ? "default" : "secondary"}>{row.original.paymentStatus.toUpperCase()}</Badge>,
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => <SortableHeader label={t("table.date")} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
    },
    {
      id: "actions",
      header: () => <div className="text-center">{t("table.invoice")}</div>,
      cell: ({ row }) => {
        const isDownloading = downloadingInvoices.has(row.original.paymentId);

        if (row.original.paymentStatus !== "completed") {
          return <div className="text-center text-xs text-muted-foreground">{t("table.notAvailable")}</div>;
        }

        return (
          <div className="text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleDownloadInvoice(row.original.paymentId)}
              disabled={isDownloading}
              className="h-8 w-8 p-0"
            >
              <Download className={`h-4 w-4 ${isDownloading ? "animate-pulse" : ""}`} />
              <span className="sr-only">{t("downloadInvoice")}</span>
            </Button>
          </div>
        );
      },
    },
  ];

  const table = useReactTable({
    data: payments,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SortableHeader({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" onClick={onClick} className="h-8 px-2">
      {label}
      <ArrowUpDown className="ml-2 h-4 w-4" />
    </Button>
  );
}
