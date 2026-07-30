"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, CreditCard, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { downloadInvoice } from "@/lib/services/credits";
import { creditPackages } from "@/config/billing";
import { formatDate } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PurchaseHistoryProps {
  purchases: Array<{
    id: string;
    packageKey: string;
    credits: number;
    bonusCredits: number;
    priceInclVat: number;
    priceExclVat: number;
    paymentStatus: "pending" | "completed" | "failed" | "refunded";
    paymentId?: string;
    createdAt: string;
  }>;
}

export function PurchaseHistory({ purchases }: PurchaseHistoryProps) {
  const t = useTranslations("billing.purchases");
  const [downloadingInvoices, setDownloadingInvoices] = React.useState<Set<string>>(new Set());

  const handleDownloadInvoice = async (paymentId: string) => {
    setDownloadingInvoices(prev => new Set(prev).add(paymentId));
    
    try {
      const result = await downloadInvoice(paymentId);
      
      if (result.success && result.invoiceUrl) {
        // Open invoice in new tab
        window.open(result.invoiceUrl, "_blank");
        toast.success("Invoice downloaded successfully");
      } else {
        toast.error("Invoice URL not available");
      }
    } catch (error) {
      console.error("Error downloading invoice:", error);
      toast.error("Failed to download invoice");
    } finally {
      setDownloadingInvoices(prev => {
        const next = new Set(prev);
        next.delete(paymentId);
        return next;
      });
    }
  };

  const columns: ColumnDef<PurchaseHistoryProps["purchases"][number]>[] = [
    {
      accessorKey: "packageKey",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 px-2"
          >
            {t("table.package")}
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      cell: ({ row }) => {
        const packageKey = row.getValue("packageKey") as string;
        return (
          <div className="font-medium capitalize">
            {packageKey}
          </div>
        );
      },
    },
    {
      accessorKey: "credits",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 px-2"
          >
            {t("table.credits")}
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      cell: ({ row }) => {
        const credits = row.getValue("credits") as number;
        const bonusCredits = row.original.bonusCredits;
        return (
          <div>
            {credits}
            {bonusCredits > 0 && (
              <span className="text-xs text-green-600 ml-1">
                (+{bonusCredits} {t("bonus")})
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "priceInclVat",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 px-2"
          >
            {t("table.amount")}
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      cell: ({ row }) => {
        const priceInclVat = row.getValue("priceInclVat") as number;
        const priceExclVat = row.original.priceExclVat;
        return (
          <div className="flex flex-col">
            <span className="font-medium">
              €{(priceInclVat / 100).toFixed(2)}
            </span>
            <span className="text-xs text-muted-foreground">
              excl. VAT: €{(priceExclVat / 100).toFixed(2)}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "paymentStatus",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 px-2"
          >
            {t("table.status")}
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      cell: ({ row }) => {
        const paymentStatus = row.getValue("paymentStatus") as string;
        
        return (
          <Badge
            variant={
              paymentStatus === "completed"
                ? "default"
                : paymentStatus === "pending"
                  ? "secondary"
                  : "destructive"
            }
          >
            <span>{paymentStatus.toUpperCase()}</span>

          </Badge>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 px-2"
          >
            {t("table.date")}
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      cell: ({ row }) => {
        const createdAt = row.getValue("createdAt") as string;
        return (
          <span className="text-muted-foreground text-sm">
            {formatDate(createdAt)}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: () => <div className="text-center">Invoice</div>,
      cell: ({ row }) => {
        const paymentStatus = row.original.paymentStatus;
        const paymentId = row.original.paymentId;
        const isDownloading = paymentId ? downloadingInvoices.has(paymentId) : false;
        
        // Only show download button for completed payments
        if (paymentStatus !== "completed" || !paymentId) {
          return (
            <div className="text-center">
              <span className="text-xs text-muted-foreground">N/A</span>
            </div>
          );
        }
        
        // Hide download button for seeded/fake payment IDs (format: pay_{timestamp}_{random})
        // Real provider payment IDs have a different format
        const isSeededPayment = /^pay_\d+_[a-z0-9]+$/.test(paymentId);
        if (isSeededPayment) {
          return (
            <div className="text-center">
              <span className="text-xs text-muted-foreground">N/A</span>
            </div>
          );
        }
        
        return (
          <div className="text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDownloadInvoice(paymentId)}
              disabled={isDownloading}
              className="h-8 w-8 p-0"
            >
              <Download className={`h-4 w-4 ${isDownloading ? "animate-pulse" : ""}`} />
              <span className="sr-only">Download invoice</span>
            </Button>
          </div>
        );
      },
    },
  ];

  const table = useReactTable({
    data: purchases,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {purchases.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          </div>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => {
                        return (
                          <TableHead key={header.id}>
                            {header.isPlaceholder
                              ? null
                              : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext()
                                )}
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        data-state={row.getIsSelected() && "selected"}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className="h-24 text-center"
                      >
                        No purchases found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-end space-x-2 py-4">
              <div className="space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
