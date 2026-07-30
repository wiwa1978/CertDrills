"use client";

import * as React from "react";
import { Plus, Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DiscountDialog } from "./discount-dialog";
import { DiscountsTable } from "./discounts-table";
import type {
  DiscountWithUsers,
  DiscountFormData,
  DiscountStatus,
} from "@/types/discounts";
import { deleteDiscount, getDiscounts } from "@/lib/services/discounts";
import { toast } from "sonner";

export function DiscountsSection() {
  const [discounts, setDiscounts] = React.useState<DiscountWithUsers[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | DiscountStatus>(
    "all"
  );
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dialogMode, setDialogMode] = React.useState<"create" | "edit">("create");
  const [selectedDiscount, setSelectedDiscount] = React.useState<DiscountWithUsers | undefined>();

  const fetchDiscounts = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await getDiscounts(
        50,
        0,
        searchQuery || undefined,
        statusFilter === "all" ? undefined : statusFilter
      );
      setDiscounts(result.discounts);
    } catch (error) {
      console.error("Failed to fetch discounts:", error);
      toast.error("Failed to load discounts");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter]);

  React.useEffect(() => {
    fetchDiscounts();
  }, [fetchDiscounts]);

  const handleCreateDiscount = () => {
    setSelectedDiscount(undefined);
    setDialogMode("create");
    setDialogOpen(true);
  };

  const handleEditDiscount = (discount: DiscountWithUsers) => {
    setSelectedDiscount(discount);
    setDialogMode("edit");
    setDialogOpen(true);
  };

  const handleDeleteDiscount = async (discount: DiscountWithUsers) => {
    if (!confirm(`Are you sure you want to delete discount "${discount.code}"?`)) {
      return;
    }

    const secret = window.prompt("Enter admin secret to delete this discount.")?.trim();
    if (!secret) {
      return;
    }

    try {
      const result = await deleteDiscount(discount.id, secret);
      if (result.success) {
        toast.success(`Discount "${discount.code}" deleted successfully`);
        await fetchDiscounts();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error("Failed to delete discount:", error);
      toast.error("Failed to delete discount");
    }
  };

  const handleDialogSuccess = async () => {
    await fetchDiscounts();
    toast.success(
      dialogMode === "create"
        ? "Discount created successfully"
        : "Discount updated successfully"
    );
  };

  const getInitialFormData = (): (Partial<DiscountFormData> & { id?: string }) | undefined => {
    if (!selectedDiscount) return undefined;

    return {
      id: selectedDiscount.id,
      code: selectedDiscount.code,
      type: selectedDiscount.type,
      value: parseFloat(selectedDiscount.value),
      startDate: new Date(selectedDiscount.startDate),
      endDate: new Date(selectedDiscount.endDate),
      maxUses: selectedDiscount.maxUses ?? undefined,
    };
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Discount Codes</CardTitle>
          <Button onClick={handleCreateDiscount}>
            <Plus className="mr-2 h-4 w-4" />
            Create Discount
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by discount code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(value) =>
              setStatusFilter(value as "all" | DiscountStatus)
            }
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Discounts Table */}
        <DiscountsTable
          discounts={discounts}
          loading={loading}
          onEdit={handleEditDiscount}
          onDelete={handleDeleteDiscount}
        />
      </CardContent>

      {/* Create/Edit Dialog */}
      <DiscountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        initialData={getInitialFormData()}
        onSuccess={handleDialogSuccess}
      />
    </Card>
  );
}
