"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Calendar, Percent, Loader2, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  generateDiscountCodeAction,
  validateDiscountCodeAction,
} from "@/lib/services/discounts";
import { createDiscountSchema } from "@/schemas/discounts";
import type { DiscountFormData } from "@/types/discounts";

const discountFormSchema = createDiscountSchema.extend({
  startDate: z.date(),
  endDate: z.date(),
  secret: z.string().trim().min(1, "Admin secret is required"),
});

type DiscountFormValues = z.infer<typeof discountFormSchema>;

interface DiscountFormProps {
  initialData?: Partial<DiscountFormData>;
  onSubmit: (data: DiscountFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  mode?: "create" | "edit";
}

export function DiscountForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
  mode = "create",
}: DiscountFormProps) {
  const [isGeneratingCode, setIsGeneratingCode] = React.useState(false);
  const [isValidatingCode, setIsValidatingCode] = React.useState(false);
  const [customPrefix, setCustomPrefix] = React.useState("");
  const [codeValidation, setCodeValidation] = React.useState<{
    valid: boolean;
    message?: string;
  } | null>(null);

  const form = useForm<DiscountFormValues>({
    resolver: zodResolver(discountFormSchema),
    defaultValues: {
      code: initialData?.code || "",
      type: "percentage",
      value: initialData?.value || 10,
      startDate: initialData?.startDate || new Date(),
      endDate: initialData?.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      maxUses: initialData?.maxUses || null,
      secret: "",
    },
  });

  // Auto-generate code on mount for create mode
  React.useEffect(() => {
    if (mode === "create" && !initialData?.code) {
      handleGenerateCode();
    }
  }, [mode, initialData?.code]);

  // Regenerate code when custom prefix changes
  React.useEffect(() => {
    if (mode === "create" && !initialData?.code) {
      handleGenerateCode();
    }
  }, [customPrefix]);

  // Validate code on change
  const handleCodeChange = async (value: string) => {
    form.setValue("code", value);
    setCodeValidation(null);

    if (value.length >= 4) {
      setIsValidatingCode(true);
      try {
        const result = await validateDiscountCodeAction(value);
        setCodeValidation({
          valid: result.valid,
          message: result.error,
        });
      } catch (error) {
        console.error("Code validation error:", error);
      } finally {
        setIsValidatingCode(false);
      }
    }
  };

  const handleGenerateCode = async () => {
    setIsGeneratingCode(true);
    try {
      const result = await generateDiscountCodeAction(customPrefix || undefined);
      if (result.error) {
        setCodeValidation({
          valid: false,
          message: result.error,
        });
      } else {
        form.setValue("code", result.code);
        setCodeValidation({ valid: true, message: "Code is unique" });
      }
    } catch (error) {
      console.error("Failed to generate code:", error);
      setCodeValidation({
        valid: false,
        message: "Failed to generate unique code",
      });
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const handleSubmit = async (data: DiscountFormValues) => {
    // Validate code before submission
    if (codeValidation && !codeValidation.valid) {
      return;
    }

    await onSubmit(data as DiscountFormData);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Custom Prefix and Discount Code */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Custom Prefix (Optional)</label>
            <Input
              value={customPrefix}
              onChange={(e) => setCustomPrefix(e.target.value.toUpperCase())}
              placeholder="e.g., XMAS for Christmas"
              className="font-mono uppercase"
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              Enter a custom prefix for discount code (e.g., &quot;XMAS&quot; for codes like XMAS-ABC-1234). Leave empty to use default format (DSCT-ABC-1234).
            </p>
          </div>

          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Discount Code</FormLabel>
                <div className="flex gap-2">
                  <FormControl>
                    <div className="relative flex-1">
                      <Input
                        {...field}
                        onChange={(e) => handleCodeChange(e.target.value)}
                        placeholder={customPrefix ? `${customPrefix}-ABC-1234` : "DSCT-ABC-1234"}
                        className="font-mono uppercase"
                        disabled={isSubmitting}
                      />
                      {isValidatingCode && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  </FormControl>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleGenerateCode}
                    disabled={isGeneratingCode || isSubmitting}
                    title="Generate new code"
                  >
                    <RefreshCw
                      className={cn(
                        "h-4 w-4",
                        isGeneratingCode && "animate-spin"
                      )}
                    />
                  </Button>
                </div>
                <FormDescription className="text-xs">
                  {codeValidation ? (
                    codeValidation.valid ? (
                      <span className="text-green-600 dark:text-green-400">✓ {codeValidation.message}</span>
                    ) : (
                      <span className="text-destructive">{codeValidation.message}</span>
                    )
                  ) : customPrefix ? (
                    `Unique code with prefix "${customPrefix}": ${customPrefix}-ABC-1234. Auto-generated but can be edited.`
                  ) : (
                    "Unique code in format: PREFIX-XXX-XXXX (e.g., DSCT-ABC-1234). Auto-generated but can be edited."
                  )}
                </FormDescription>
                <FormMessage />
                {codeValidation && (
                  <Alert
                    variant={codeValidation.valid ? "default" : "destructive"}
                    className="mt-2"
                  >
                    <AlertDescription className="text-sm">
                      {codeValidation.message}
                    </AlertDescription>
                  </Alert>
                )}
              </FormItem>
            )}
          />
        </div>

        {/* Discount Type and Discount Percentage */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-lg border p-4 bg-muted/50">
            <div className="space-y-0.5">
              <FormLabel className="text-base">Discount Type</FormLabel>
              <FormDescription className="text-sm">
                Percentage-based discount (e.g., 10% off)
              </FormDescription>
            </div>
          </div>

          <FormField
            control={form.control}
            name="value"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Discount Percentage (%)</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      max="100"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      disabled={isSubmitting}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <Percent className="h-4 w-4" />
                    </div>
                  </div>
                </FormControl>
                <FormDescription className="text-sm">
                  Enter the percentage discount (1-100)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Start Date and End Date */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Start Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                        disabled={isSubmitting}
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      initialFocus
                      disabled={(date) => date < new Date("1900-01-01")}
                    />
                  </PopoverContent>
                </Popover>
                <FormDescription className="text-sm">
                  When the discount becomes available for use
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>End Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                        disabled={isSubmitting}
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      initialFocus
                      disabled={(date) => {
                        const startDate = form.getValues("startDate");
                        return date < new Date("1900-01-01") || 
                               (startDate && date < startDate);
                      }}
                    />
                  </PopoverContent>
                </Popover>
                <FormDescription className="text-sm">
                  When the discount expires
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Maximum Uses */}
        <FormField
          control={form.control}
          name="maxUses"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Maximum Uses (Optional)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="1"
                  placeholder="Unlimited"
                  value={field.value ?? undefined}
                  onChange={(e) => {
                    const value = e.target.value ? parseInt(e.target.value) : "";
                    field.onChange(value);
                  }}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormDescription className="text-sm">
                Leave empty for unlimited uses. Minimum 1 use if specified.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="secret"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Admin Secret</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="Enter admin secret"
                  {...field}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormDescription className="text-sm">
                Required to create or update discount codes.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Form Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || (codeValidation !== null && !codeValidation.valid)}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "create" ? "Create Discount" : "Update Discount"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
