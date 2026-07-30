"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import {
  createDiscount,
  updateDiscount,
} from "@/lib/services/discounts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DiscountForm } from "./discount-form";
import type { DiscountFormData } from "@/types/discounts";

interface DiscountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "create" | "edit";
  initialData?: Partial<DiscountFormData> & { id?: string };
  onSuccess?: () => void;
}

export function DiscountDialog({
  open,
  onOpenChange,
  mode = "create",
  initialData,
  onSuccess,
}: DiscountDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (data: DiscountFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      let result;
      if (mode === "create") {
        result = await createDiscount(data);
      } else {
        result = await updateDiscount({
          id: initialData?.id || "",
          ...data,
        });
      }

      if (result.success) {
        onSuccess?.();
        onOpenChange(false);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (!isSubmitting) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create New Discount" : "Edit Discount"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Create a new discount code and assign it to users."
              : "Update the discount details and user assignments."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DiscountForm
          initialData={initialData}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isSubmitting={isSubmitting}
          mode={mode}
        />

        {isSubmitting && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-lg">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
