"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

interface PurchaseDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchase: {
    id: string;
    packageKey: string;
    credits: number;
    bonusCredits: number;
    priceInclVat: number;
    priceExclVat: number;
    paymentStatus: string;
    createdAt: string;
  } | null;
}

export function PurchaseDetailsDialog({
  open,
  onOpenChange,
  purchase,
}: PurchaseDetailsDialogProps) {
  if (!purchase) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Purchase Details</DialogTitle>
          <DialogDescription>
            View detailed information about this credit purchase
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Purchase ID */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Purchase ID</span>
            <span className="text-sm font-mono">{purchase.id}</span>
          </div>

          {/* Date */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Date</span>
            <span className="text-sm">{formatDateTime(purchase.createdAt)}</span>
          </div>

          {/* Package */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Package</span>
            <span className="text-sm font-medium capitalize">{purchase.packageKey}</span>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge
              variant={
                purchase.paymentStatus === "completed"
                  ? "default"
                  : purchase.paymentStatus === "pending"
                    ? "secondary"
                    : "destructive"
              }
            >
              {purchase.paymentStatus}
            </Badge>
          </div>

          {/* Credits */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Credits</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{purchase.credits}</span>
              {purchase.bonusCredits > 0 && (
                <span className="text-xs text-green-600">
                  (+{purchase.bonusCredits} bonus)
                </span>
              )}
            </div>
          </div>

          {/* Amount excl. VAT */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Amount (excl. VAT)</span>
            <span className="text-sm">
              €{(parseInt(purchase.priceExclVat.toString()) / 100).toFixed(2)}
            </span>
          </div>

          {/* VAT */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">VAT</span>
            <span className="text-sm">
              €{((parseInt(purchase.priceInclVat.toString()) - parseInt(purchase.priceExclVat.toString())) / 100).toFixed(2)}
            </span>
          </div>

          {/* Amount incl. VAT */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Amount (incl. VAT)</span>
            <span className="text-sm font-medium">
              €{(parseInt(purchase.priceInclVat.toString()) / 100).toFixed(2)}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
