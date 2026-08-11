import { z } from "zod";

import { paginationQuerySchema } from "../common/pagination";
import { optionalLimitQuerySchema, timeRangeSchema } from "../common/query";
import { runtimeApplicationSettingKeySchema } from "../application-settings/common";

export const verifyAdminSecretSchema = z.object({
  secret: z.string().trim().min(1).max(255),
});

export const setRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["user", "admin"]),
  reason: z.string().trim().max(1000).optional(),
  confirmed: z.boolean().optional(),
  secret: z.string().trim().min(1).max(255),
});

export const userOnlySchema = z.object({
  userId: z.string().uuid(),
  secret: z.string().trim().min(1).max(255),
});

export const setUserPasswordSchema = z.object({
  userId: z.string().uuid(),
  newPassword: z.string().min(8).max(128),
  secret: z.string().trim().min(1).max(255),
});

export const banUserSchema = z.strictObject({
  userId: z.string().uuid(),
  secret: z.string().trim().min(1).max(255),
  banReason: z.string().trim().min(1).max(1000).optional(),
  banExpiresIn: z.number().int().positive().optional(),
});

export const billingRangeQuerySchema = z.object({
  timeRange: timeRangeSchema.default("daily"),
});

export const billingListQuerySchema = paginationQuerySchema.extend({
  searchEmail: z.string().trim().email().max(255).optional(),
});

export const adminBillingDashboardRangeSchema = z.enum(["7d", "30d", "90d", "12m", "ytd"]);

export const adminCreditsDashboardQuerySchema = z.object({
  creditsPurchasesPage: z.coerce.number().int().min(1).default(1),
  creditsPurchasesSearch: z.string().trim().max(255).optional(),
  creditsRefundsPage: z.coerce.number().int().min(1).default(1),
  creditsRefundsSearch: z.string().trim().max(255).optional(),
  range: adminBillingDashboardRangeSchema.default("30d"),
});

export const adminSubscriptionFinanceDashboardQuerySchema = z.object({
  range: adminBillingDashboardRangeSchema.default("ytd"),
  startDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  grouping: z.enum(["day", "week", "month", "year"]).default("day"),
  currency: z.string().trim().min(1).max(10).optional(),
  planKey: z.string().trim().min(1).max(100).optional(),
  status: z.enum(["active", "trialing", "past_due", "canceled", "expired", "paused"]).optional(),
  search: z.string().trim().min(1).max(255).optional(),
  subscriptionsPage: z.coerce.number().int().min(1).default(1),
  subscriptionsSearch: z.string().trim().min(1).max(255).optional(),
});

const isoDateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Invalid ISO date");

export const adminTransactionFinanceDashboardQuerySchema = z.object({
  range: z.enum(["7d", "30d", "90d", "12m", "custom"]).default("30d"),
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
  grouping: z.enum(["day", "week", "month", "year"]).optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  status: z.enum(["pending_payment", "paid", "failed", "cancelled", "refund_pending", "refunded", "partially_refunded"]).optional(),
  productKey: z.string().trim().min(1).max(100).optional(),
  search: z.string().trim().min(1).max(255).optional(),
  page: z.coerce.number().int().positive().max(10_000).default(1),
}).superRefine((query, context) => {
  if (query.range !== "custom") return;
  if (!query.startDate) context.addIssue({ code: "custom", path: ["startDate"], message: "Start date is required for a custom range" });
  if (!query.endDate) context.addIssue({ code: "custom", path: ["endDate"], message: "End date is required for a custom range" });
  if (query.startDate && query.endDate && query.startDate > query.endDate) {
    context.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after start date" });
  }
  if (query.startDate && query.endDate && inclusiveDays(query.startDate, query.endDate) > 366) {
    context.addIssue({ code: "custom", path: ["endDate"], message: "Custom range cannot exceed 366 days" });
  }
});

function inclusiveDays(startDate: string, endDate: string) {
  return Math.floor((Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / 86_400_000) + 1;
}

export type AdminTransactionFinanceDashboardQuery = z.infer<typeof adminTransactionFinanceDashboardQuerySchema>;

export const createCreditRefundSchema = z.object({
  paymentId: z.string().trim().min(1, "Payment ID is required").max(255),
  reason: z.string().trim().max(3000, "Reason must be 3000 characters or fewer").optional(),
  secret: z.string().trim().min(1).max(255),
});
export const createTransactionRefundSchema = z.object({
  orderId: z.string().uuid("Order ID must be a UUID"),
  reason: z.string().trim().max(3000, "Reason must be 3000 characters or fewer").optional(),
  secret: z.string().trim().min(1).max(255),
});


export const createSubscriptionRefundSchema = z.object({
  paymentId: z.string().trim().min(1, "Payment ID is required").max(255),
  reason: z.string().trim().max(3000, "Reason must be 3000 characters or fewer").optional(),
  secret: z.string().trim().min(1).max(255),
});

export const adminSecretOnlySchema = z.object({
  secret: z.string().trim().min(1).max(255),
});

export const webhookEventStatusSchema = z.enum(["processing", "processed", "failed"]);

export const webhookEventsQuerySchema = paginationQuerySchema.extend({
  provider: z.string().trim().min(1).max(100).optional(),
  status: webhookEventStatusSchema.optional(),
  eventType: z.string().trim().min(1).max(255).optional(),
  paymentId: z.string().trim().min(1).max(255).optional(),
  text: z.string().trim().min(1).max(255).optional(),
  dateFrom: z.string().trim().min(1).max(40).optional(),
  dateTo: z.string().trim().min(1).max(40).optional(),
});

export const webhookEventIdParamSchema = z.object({
  eventId: z.string().uuid(),
});

const adminBackgroundEventStatusFilterSchema = z.enum(["pending", "publishing", "published", "failed"]);
const adminEmailDeliveryStatusFilterSchema = z.enum(["pending", "sending", "sent", "failed"]);

export const adminBackgroundEventsQuerySchema = paginationQuerySchema.extend({
  eventName: z.string().trim().min(1).max(255).optional(),
  status: adminBackgroundEventStatusFilterSchema.optional(),
});

export const adminEmailDeliveriesQuerySchema = paginationQuerySchema.extend({
  status: adminEmailDeliveryStatusFilterSchema.optional(),
  text: z.string().trim().min(1).max(255).optional(),
});

export const backgroundEventIdParamSchema = z.object({
  eventId: z.string().uuid(),
});

export const updateApplicationSettingSchema = z.object({
  key: runtimeApplicationSettingKeySchema,
  value: z.number().int(),
  secret: z.string().trim().min(1).max(255),
});

export const resetApplicationSettingSchema = z.object({
  key: runtimeApplicationSettingKeySchema,
  secret: z.string().trim().min(1).max(255),
});

export const searchUsersQuerySchema = z.object({
  query: z.string().trim().min(2).max(255),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const notificationsListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export { optionalLimitQuerySchema };
