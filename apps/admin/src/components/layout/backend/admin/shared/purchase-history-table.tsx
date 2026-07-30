"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, Download } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { PurchaseDetailsDialog } from "../users/purchase-details-dialog";
import { downloadInvoice } from "@/lib/services/credits";
import { getAdminAllPurchases } from "@/lib/services/admin";

export type Purchase = {
  id: string;
  packageKey: string;
  credits: number;
  bonusCredits: number;
  priceExclVat: number;
  priceInclVat: number;
  vatAmount?: number;
  currency?: string;
  paymentStatus: "pending" | "completed" | "failed" | "refunded";
  paymentId?: string;
  createdAt: string;
  userId?: string;
  userName?: string | null;
  userEmail?: string;
};

export type SearchPageState = {
  searchEmail?: string;
  limit: number;
  offset: number;
};

type PurchaseHistoryResponse = {
  purchases: Purchase[];
  total: number;
  hasMore: boolean;
};

interface PurchaseHistoryTableProps {
  purchases: Purchase[];
  // Optional: show user columns (default: true)
  showUserColumns?: boolean;
  // Optional: show card wrapper (default: true)
  showCard?: boolean;
  // Optional: enable search (default: true)
  enableSearch?: boolean;
  // Optional: enable row click for details (default: true)
  enableRowClick?: boolean;
  // Optional: custom title and description
  title?: string;
  description?: string;
  // Optional: custom bonus text
  bonusText?: string;
  // Optional: server pagination/search state
  total?: number;
  loading?: boolean;
  onSearchPageChange?: (state: SearchPageState) => void;
}

interface AdminPurchaseHistoryTableProps {
  initialData: PurchaseHistoryResponse;
  description?: string;
}

const PURCHASES_LIMIT = 20;

export function AdminPurchaseHistoryTable({ initialData, description }: AdminPurchaseHistoryTableProps) {
  const [searchState, setSearchState] = React.useState<SearchPageState>({
    limit: PURCHASES_LIMIT,
    offset: 0,
  });

  const purchasesQuery = useQuery({
    queryKey: ["admin-billing-purchases", searchState.limit, searchState.offset, searchState.searchEmail ?? ""],
    queryFn: () => getAdminAllPurchases(searchState.limit, searchState.offset, searchState.searchEmail),
    initialData: searchState.offset === 0 && !searchState.searchEmail ? initialData : undefined,
  });
  const data = purchasesQuery.data ?? { purchases: [], total: 0, hasMore: false };

  return (
    <PurchaseHistoryTable
      purchases={data.purchases}
      total={data.total}
      loading={purchasesQuery.isFetching}
      showUserColumns={true}
      enableSearch={true}
      description={description}
      onSearchPageChange={setSearchState}
    />
  );
}

export function PurchaseHistoryTable({
  purchases,
  showUserColumns = true,
  showCard = true,
  enableSearch = true,
  enableRowClick = true,
  title,
  description,
  bonusText,
  total: serverTotal,
  loading = false,
  onSearchPageChange,
}: PurchaseHistoryTableProps) {
  const t = useTranslations("admin.billing.purchases");
  const defaultBonusText = bonusText || t("bonus");

  // State
  const [searchQuery, setSearchQuery] = React.useState("");
  const [submittedSearchQuery, setSubmittedSearchQuery] = React.useState("");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [selectedPurchase, setSelectedPurchase] =
    React.useState<Purchase | null>(null);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [downloadingInvoices, setDownloadingInvoices] = React.useState<Set<string>>(new Set());

  const limit = PURCHASES_LIMIT;
  const isServerBacked = Boolean(onSearchPageChange);
  const filteredPurchases = React.useMemo(() => {
    if (isServerBacked || !submittedSearchQuery) return purchases;

    const query = submittedSearchQuery.toLowerCase();
    return purchases.filter((purchase) => (
      purchase.userName?.toLowerCase().includes(query) ||
      purchase.userEmail?.toLowerCase().includes(query) ||
      purchase.packageKey.toLowerCase().includes(query) ||
      purchase.paymentStatus.toLowerCase().includes(query) ||
      purchase.paymentId?.toLowerCase().includes(query)
    ));
  }, [isServerBacked, purchases, submittedSearchQuery]);
  const total = serverTotal ?? filteredPurchases.length;
  const totalPages = Math.ceil(total / limit);

  const visiblePurchases = React.useMemo(() => {
    if (isServerBacked) return purchases;
    const start = (currentPage - 1) * limit;
    return filteredPurchases.slice(start, start + limit);
  }, [currentPage, filteredPurchases, isServerBacked, limit, purchases]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const nextSearchQuery = searchQuery.trim();
    setSubmittedSearchQuery(nextSearchQuery);
    setCurrentPage(1);
    onSearchPageChange?.({
      limit,
      offset: 0,
      searchEmail: nextSearchQuery || undefined,
    });
  };

  const handlePageChange = (page: number) => {
    const nextPage = Math.min(Math.max(1, page), Math.max(1, totalPages));
    setCurrentPage(nextPage);
    onSearchPageChange?.({
      limit,
      offset: (nextPage - 1) * limit,
      searchEmail: submittedSearchQuery || undefined,
    });
  };

  const handleRowClick = (purchase: Purchase) => {
    if (!enableRowClick) return;
    setSelectedPurchase(purchase);
    setIsDialogOpen(true);
  };

  const handleDownloadInvoice = async (e: React.MouseEvent, paymentId: string) => {
    // Prevent row click event from triggering
    e.stopPropagation();
    
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

  const getPaymentStatusBadge = (status: string) => {
    const variant =
      status === "completed"
        ? "default"
        : status === "pending"
          ? "secondary"
          : status === "refunded"
            ? "outline"
            : "destructive";
    const className =
      status === "pending"
        ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-300"
        : status === "completed"
          ? "bg-green-100 text-green-800 hover:bg-green-200 border-green-300"
          : status === "refunded"
            ? "bg-gray-100 text-gray-800 hover:bg-gray-200 border-gray-300"
            : "";
    return <Badge variant={variant} className={className}>{status}</Badge>;
  };

  const columns: ColumnDef<Purchase>[] = React.useMemo(() => {
    const cols: ColumnDef<Purchase>[] = [];

    // User column
    if (showUserColumns) {
      cols.push({
        accessorKey: "userName",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {t("table.user")}
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const purchase = row.original;
          return (
            <div className="flex flex-col">
              <span className="font-medium">{purchase.userName || "Unknown"}</span>
              <span className="text-xs text-muted-foreground">{purchase.userEmail}</span>
            </div>
          );
        },
      });
    }

    cols.push(
      {
        accessorKey: "packageKey",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {t("table.package")}
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="font-medium capitalize">{row.original.packageKey}</span>
        ),
      },
      {
        accessorKey: "credits",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {t("table.credits")}
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const purchase = row.original;
          return (
            <div>
              {purchase.credits}
              {purchase.bonusCredits > 0 && (
                <span className="text-xs text-green-600 ml-1">
                  (+{purchase.bonusCredits} {defaultBonusText})
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "priceInclVat",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {t("table.amount")}
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const purchase = row.original;
          return (
            <div className="flex flex-col">
              <span className="font-medium">
                €{(parseInt(purchase.priceInclVat.toString()) / 100).toFixed(2)}
              </span>
              <span className="text-xs text-muted-foreground">
                excl. VAT: €{(parseInt(purchase.priceExclVat.toString()) / 100).toFixed(2)}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "paymentStatus",
        header: t("table.status"),
        cell: ({ row }) => getPaymentStatusBadge(row.original.paymentStatus),
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {t("table.date")}
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {formatDateTime(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: "actions",
        header: () => <div className="text-center">Invoice</div>,
        cell: ({ row }) => {
          const purchase = row.original;
          const isDownloading = purchase.paymentId ? downloadingInvoices.has(purchase.paymentId) : false;
          
          // Only show download button for completed payments with paymentId
          if (purchase.paymentStatus !== "completed" || !purchase.paymentId) {
            return (
              <div className="text-center">
                <span className="text-xs text-muted-foreground">N/A</span>
              </div>
            );
          }
          
          // Hide download button for seeded/fake payment IDs (format: pay_{timestamp}_{random})
          // Real provider payment IDs have a different format
          const isSeededPayment = /^pay_\d+_[a-z0-9]+$/.test(purchase.paymentId);
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
                onClick={(e) => handleDownloadInvoice(e, purchase.paymentId!)}
                disabled={isDownloading}
                className="h-8 w-8 p-0"
              >
                <Download className={`h-4 w-4 ${isDownloading ? "animate-pulse" : ""}`} />
                <span className="sr-only">Download invoice</span>
              </Button>
            </div>
          );
        },
      }
    );

    return cols;
  }, [showUserColumns, t, defaultBonusText, downloadingInvoices]);

  const from = total > 0 ? (currentPage - 1) * limit + 1 : 0;
  const to = Math.min(currentPage * limit, total);

  const tableContent = (
    <>
      {/* Search */}
      {enableSearch && (
        <form onSubmit={handleSearch} className="mb-6 flex gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button type="submit">{t("search")}</Button>
        </form>
      )}

      {/* Table */}
      <DataTable
        columns={columns}
        data={visiblePurchases}
        loading={loading}
        loadingText={t("loading")}
        emptyText={t("noPurchases")}
        onRowClick={enableRowClick ? handleRowClick : undefined}
      />

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            {t("pagination.showing", { from, to, total })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t("pagination.previous")}
            </Button>
            <span className="text-sm">
              {t("pagination.page", { current: currentPage, total: totalPages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              {t("pagination.next")}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Purchase Details Dialog */}
      {enableRowClick && selectedPurchase && (
        <PurchaseDetailsDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          purchase={selectedPurchase}
        />
      )}
    </>
  );

  if (!showCard) {
    return tableContent;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title || t("title")}</CardTitle>
        <CardDescription>{description || t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {tableContent}
      </CardContent>
    </Card>
  );
}
