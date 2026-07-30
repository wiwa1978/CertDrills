"use client";

import * as React from "react";
import { format } from "date-fns";
import { MoreHorizontal, Edit, Trash2, Users, Calendar, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import type { DiscountWithUsers } from "@/types/discounts";

interface DiscountsTableProps {
  discounts: DiscountWithUsers[];
  loading?: boolean;
  onEdit: (discount: DiscountWithUsers) => void;
  onDelete: (discount: DiscountWithUsers) => void;
  onAssignUsers?: (discount: DiscountWithUsers) => void;
}

export function DiscountsTable({
  discounts,
  loading = false,
  onEdit,
  onDelete,
  onAssignUsers,
}: DiscountsTableProps) {
  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "active":
        return "default";
      case "inactive":
        return "secondary";
      case "expired":
        return "destructive";
      default:
        return "outline";
    }
  };

  const formatValue = (discount: DiscountWithUsers) => {
    const value = parseFloat(discount.value);
    return `${value}%`;
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (discounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Percent className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No discounts found</h3>
        <p className="text-muted-foreground text-sm max-w-md">
          Create your first discount code to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Validity</TableHead>
            <TableHead>Usage</TableHead>
            <TableHead>Assigned Users</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {discounts.map((discount) => (
            <TableRow key={discount.id}>
              <TableCell className="font-mono font-medium">
                {discount.code}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Percent className="h-4 w-4 text-muted-foreground" />
                  <span className="capitalize">{discount.type}</span>
                </div>
              </TableCell>
              <TableCell className="font-medium">
                {formatValue(discount)}
              </TableCell>
              <TableCell>
                <Badge variant={getStatusBadgeVariant(discount.status)}>
                  {discount.status}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1 text-sm">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  <span>
                    {format(new Date(discount.startDate), "MMM d, yyyy")} -{" "}
                    {format(new Date(discount.endDate), "MMM d, yyyy")}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="text-sm">
                  {discount.maxUses ? (
                    <span>
                      {discount.currentUses} / {discount.maxUses}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {discount.currentUses} / Unlimited
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1 text-sm">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <span>{discount.userDiscounts?.length || 0}</span>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Open menu</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onEdit(discount)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    {onAssignUsers && (
                      <DropdownMenuItem onClick={() => onAssignUsers(discount)}>
                        <Users className="mr-2 h-4 w-4" />
                        Assign Users
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(discount)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
