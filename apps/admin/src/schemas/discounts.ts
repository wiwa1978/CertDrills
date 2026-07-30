import { z } from "zod";
import {
  createDiscountSchema,
  discountStatusSchema,
  discountTypeSchema,
  updateDiscountSchema,
  validateDiscountCodeSchema,
} from "@platform/contracts";

export { createDiscountSchema, updateDiscountSchema, validateDiscountCodeSchema };

// Admin billing schemas
const DISCOUNT_DESCRIPTION_MAX_LENGTH = 500;

export const adminCreateDiscountSchema = z.object({
  code: z.string()
    .min(1, "Code is required")
    .max(50, "Code must be at most 50 characters")
    .regex(/^[A-Z0-9]+-[A-Z0-9]{3}-[A-Z0-9]{4}$/, "Code must be in format: PREFIX-XXX-XXXX (e.g., DSCT-ABC-1234)"),
  type: discountTypeSchema,
  value: z.number().min(0.01, "Value must be greater than 0"),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  maxUses: z.number().int().min(1, "Max uses must be at least 1").nullable(),
  isActive: z.boolean().optional().default(true),
  description: z.string()
    .max(DISCOUNT_DESCRIPTION_MAX_LENGTH, `Description must be at most ${DISCOUNT_DESCRIPTION_MAX_LENGTH} characters`)
    .optional()
    .nullable(),
});

export const adminUpdateDiscountSchema = z.object({
  id: z.string().uuid(),
  code: z.string()
    .min(1, "Code is required")
    .max(50, "Code must be at most 50 characters")
    .regex(/^[A-Z0-9]+-[A-Z0-9]{3}-[A-Z0-9]{4}$/, "Code must be in format: PREFIX-XXX-XXXX (e.g., DSCT-ABC-1234)")
    .optional(),
  type: discountTypeSchema.optional(),
  value: z.number().min(0.01, "Value must be greater than 0").optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  maxUses: z.number().int().min(1, "Max uses must be at least 1").nullable().optional(),
  isActive: z.boolean().optional(),
  description: z.string()
    .max(DISCOUNT_DESCRIPTION_MAX_LENGTH, `Description must be at most ${DISCOUNT_DESCRIPTION_MAX_LENGTH} characters`)
    .optional()
    .nullable(),
});

// ============================================================================
// Payment Provider API Validation Schemas
// ============================================================================

/**
 * Discount type enum for payment provider APIs.
 * The current provider only supports percentage-based discounts.
 */
export const providerDiscountTypeSchema = z.literal("percentage", {
  message: "The payment provider only supports percentage-based discounts",
});

/**
 * Schema for creating a discount in the payment provider.
 * Matches the exact API specification:
 * - amount: integer<int32> required - basis points (e.g., 540 = 5.4%)
 * - type: "percentage" required
 * - code: string | null
 * - expires_at: string<date-time> | null
 * - name: string | null
 * - restricted_to: string[] | null: List of product IDs to restrict usage
 * - subscription_cycles: integer<int32> | null: Number of subscription billing cycles
 * - usage_limit: integer<int32> | null: Must be >= 1 if provided
 */
export const providerCreateDiscountSchema = z.object({
  amount: z
    .number({
      message: "Amount is required and must be a number",
    })
    .int("Amount must be an integer")
    .safe("Amount must be a safe integer")
    .min(1, "Amount must be at least 1"),
  type: providerDiscountTypeSchema,
  code: z.string().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  name: z.string().nullable().optional(),
  restricted_to: z.array(z.string()).nullable().optional(),
  subscription_cycles: z
    .number({
      message: "Subscription cycles must be a number",
    })
    .int("Subscription cycles must be an integer")
    .safe("Subscription cycles must be a safe integer")
    .min(0, "Subscription cycles must be 0 or greater")
    .nullable()
    .optional(),
  usage_limit: z
    .number({
      message: "Usage limit must be a number",
    })
    .int("Usage limit must be an integer")
    .safe("Usage limit must be a safe integer")
    .min(1, "Usage limit must be at least 1 if provided")
    .nullable()
    .optional(),
});

/**
 * Schema for updating a discount in the payment provider.
 * All fields are optional
 */
export const providerUpdateDiscountSchema = z.object({
  amount: z
    .number({
      message: "Amount must be a number",
    })
    .int("Amount must be an integer")
    .safe("Amount must be a safe integer")
    .min(1, "Amount must be at least 1")
    .optional(),
  type: providerDiscountTypeSchema.optional(),
  code: z.string().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  name: z.string().nullable().optional(),
  restricted_to: z.array(z.string()).nullable().optional(),
  subscription_cycles: z
    .number({
      message: "Subscription cycles must be a number",
    })
    .int("Subscription cycles must be an integer")
    .safe("Subscription cycles must be a safe integer")
    .min(0, "Subscription cycles must be 0 or greater")
    .nullable()
    .optional(),
  usage_limit: z
    .number({
      message: "Usage limit must be a number",
    })
    .int("Usage limit must be an integer")
    .safe("Usage limit must be a safe integer")
    .min(1, "Usage limit must be at least 1 if provided")
    .nullable()
    .optional(),
});

/**
 * Schema for payment provider discount responses.
 */
export const providerDiscountSchema = z.object({
  amount: z.number().int().safe(),
  business_id: z.string(),
  code: z.string().nullable(),
  created_at: z.string().datetime(),
  discount_id: z.string(),
  expires_at: z.string().datetime().nullable(),
  name: z.string().nullable(),
  restricted_to: z.array(z.string()).nullable(),
  subscription_cycles: z.number().int().safe().nullable(),
  times_used: z.number().int().safe(),
  type: providerDiscountTypeSchema,
  usage_limit: z.number().int().safe().nullable(),
});
