import { z } from "zod";

import { successResultSchema } from "../common/result";
import { paginationQuerySchema } from "../common/pagination";

export const voucherStatusSchema = z.enum(["active", "inactive", "redeemed", "expired"]);
export const voucherAssignmentScopeSchema = z.enum(["selected", "all"]);

export const voucherCodeSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[A-Z0-9-]+$/i, "Voucher code may only contain letters, numbers, and dashes");

export const voucherListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(255).optional(),
  status: voucherStatusSchema.optional(),
});

const voucherBaseSchema = {
  code: voucherCodeSchema,
  creditAmount: z.number().int().positive().max(100000),
  maxRedemptions: z.number().int().positive().max(100000).optional(),
  assignmentScope: voucherAssignmentScopeSchema,
  userIds: z.array(z.string().uuid()).default([]),
  expiresAt: z.coerce.date().optional(),
} as const;

export const createVoucherSchema = z.object(voucherBaseSchema).superRefine((data, ctx) => {
  if (data.assignmentScope === "selected" && data.userIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one user must be selected",
      path: ["userIds"],
    });
  }
});

export const updateVoucherSchema = z.object({
  id: z.string().uuid().optional(),
  code: voucherBaseSchema.code.optional(),
  creditAmount: voucherBaseSchema.creditAmount.optional(),
  status: voucherStatusSchema.optional(),
  maxRedemptions: voucherBaseSchema.maxRedemptions,
  assignmentScope: voucherAssignmentScopeSchema.optional(),
  userIds: z.array(z.string().uuid()).optional(),
  expiresAt: z.coerce.date().nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.assignmentScope === "selected" && (!data.userIds || data.userIds.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one user must be selected",
      path: ["userIds"],
    });
  }
});

export const voucherIdParamSchema = z.object({
  voucherId: z.string().uuid(),
});

export const redeemVoucherSchema = z.object({
  code: z.string().trim().min(3).max(64),
});

export const redeemVoucherDataSchema = z.object({
  creditsAdded: z.number().int().positive(),
  newBalance: z.number().nonnegative(),
});

export const redeemVoucherResponseSchema = successResultSchema(redeemVoucherDataSchema);

export type CreateVoucherInput = z.infer<typeof createVoucherSchema>;
export type UpdateVoucherInput = z.infer<typeof updateVoucherSchema>;
export type RedeemVoucherInput = z.infer<typeof redeemVoucherSchema>;
export type VoucherStatus = z.infer<typeof voucherStatusSchema>;
export type VoucherAssignmentScope = z.infer<typeof voucherAssignmentScopeSchema>;
