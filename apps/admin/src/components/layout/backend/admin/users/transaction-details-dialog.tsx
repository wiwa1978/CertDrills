"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

interface TransactionDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: {
    id: string;
    userId: string;
    type: "purchase" | "usage" | "refund" | "bonus" | "admin_adjustment" | "voucher";
    amount: string;
    balanceBefore: string;
    balanceAfter: string;
    description: string;
    referenceType?: string | null;
    referenceId?: string | null;
    metadata?: unknown;
    createdAt: string;
  } | null;
}

export function TransactionDetailsDialog({
  open,
  onOpenChange,
  transaction,
}: TransactionDetailsDialogProps) {
  const t = useTranslations("admin.billing.transactions");

  if (!transaction) return null;

  const amount = parseFloat(transaction.amount);
  const isPositive = amount > 0;
  const typePresentation = (() => {
    switch (transaction.type) {
      case "purchase":
        return { label: t("types.purchase"), variant: "default" as const, className: "" };
      case "usage":
        return { label: t("types.usage"), variant: "secondary" as const, className: "" };
      case "bonus":
        return {
          label: t("types.bonus"),
          variant: "outline" as const,
          className: "bg-green-100 text-green-800 hover:bg-green-200 border-green-300",
        };
      case "admin_adjustment":
        return { label: t("types.admin_adjustment"), variant: "outline" as const, className: "" };
      case "voucher":
        return {
          label: t("types.voucher"),
          variant: "outline" as const,
          className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border-emerald-300",
        };
      default:
        return { label: transaction.type, variant: "destructive" as const, className: "" };
    }
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("details.title")}</DialogTitle>
          <DialogDescription>{t("details.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Transaction ID */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("details.transactionId")}</span>
            <span className="text-sm font-mono">{transaction.id}</span>
          </div>

          {/* User ID */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("details.userId")}</span>
            <span className="text-sm font-mono">{transaction.userId}</span>
          </div>

          {/* Reference ID */}
          {transaction.referenceId && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("details.referenceId")}</span>
              <span className="text-sm font-mono">{transaction.referenceId}</span>
            </div>
          )}

          {/* Date */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("details.date")}</span>
            <span className="text-sm">{formatDateTime(transaction.createdAt)}</span>
          </div>

          {/* Type */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("details.type")}</span>
            <Badge variant={typePresentation.variant} className={typePresentation.className}>
              {typePresentation.label}
            </Badge>
          </div>

          {/* Amount */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("details.amount")}</span>
            <span
              className={`text-sm font-medium ${
                isPositive ? "text-green-600" : "text-red-600"
              }`}
            >
              {isPositive ? "+" : ""}
              {amount.toFixed(2)}
            </span>
          </div>

          {/* Balance Before */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("details.balanceBefore")}</span>
            <span className="text-sm font-medium">
              {parseFloat(transaction.balanceBefore).toFixed(2)}
            </span>
          </div>

          {/* Balance After */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("details.balanceAfter")}</span>
            <span className="text-sm font-medium">
              {parseFloat(transaction.balanceAfter).toFixed(2)}
            </span>
          </div>

          {/* Description */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("details.descriptionLabel")}</span>
            <span className="text-sm text-right max-w-[60%]">{transaction.description}</span>
          </div>

          {/* Reference Type */}
          {transaction.referenceType && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("details.referenceType")}</span>
              <span className="text-sm">{transaction.referenceType}</span>
            </div>
          )}

          {/* Metadata */}
          {transaction.metadata != null &&
            typeof transaction.metadata === "object" &&
            Object.keys(transaction.metadata as Record<string, unknown>).length > 0 && (
            <div className="space-y-2">
              <span className="text-sm text-muted-foreground">{t("details.metadata")}</span>
              <div className="rounded-md border p-3">
                <pre className="text-xs overflow-auto">
                  {JSON.stringify(transaction.metadata, null, 2)}
                </pre>
              </div>
            </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
