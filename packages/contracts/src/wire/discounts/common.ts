import { z } from "zod";

import { paginationQuerySchema } from "../common/pagination";

export const discountStatusSchema = z.enum(["active", "inactive", "expired"]);
export const discountTypeSchema = z.literal("percentage");

export const discountListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(255).optional(),
  status: discountStatusSchema.optional(),
});

export const generateDiscountCodeSchema = z.object({
  overridePrefix: z.string().trim().min(2).max(20).regex(/^[A-Z0-9]+$/).optional(),
});

export const validateDiscountCodeSchema = z.object({
  code: z.string().trim().min(1).max(50),
  excludeId: z.string().uuid().optional(),
});

export const createDiscountSchema = z.object({
  code: z.string().trim().min(1).max(50).regex(/^[A-Z0-9]+-[A-Z0-9]{3}-[A-Z0-9]{4}$/),
  type: discountTypeSchema,
  value: z.number().min(0.01).max(100),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  maxUses: z.number().int().min(1).max(100000).nullable().optional(),
});

export const updateDiscountSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1).max(50).regex(/^[A-Z0-9]+-[A-Z0-9]{3}-[A-Z0-9]{4}$/).optional(),
  type: discountTypeSchema.optional(),
  value: z.number().min(0.01).max(100).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  maxUses: z.number().int().min(1).max(100000).nullable().optional(),
  status: discountStatusSchema.optional(),
});

export const discountUserAssignmentSchema = z.object({
  discountId: z.string().uuid().optional(),
  userIds: z.array(z.string().uuid()).min(1).max(500),
});

export type CreateDiscountInput = z.infer<typeof createDiscountSchema>;
export type UpdateDiscountInput = z.infer<typeof updateDiscountSchema>;
export type AssignDiscountInput = z.infer<typeof discountUserAssignmentSchema>;
