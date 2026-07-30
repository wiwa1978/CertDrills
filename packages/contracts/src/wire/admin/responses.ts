import { z } from "zod";

import { successResultSchema } from "../common/result";
import { creditBalanceSchema, creditPurchaseSchema, creditTransactionSchema } from "../billing/responses";

export const adminDashboardStatsSchema = z.object({
  totalUsers: z.number().int().nonnegative(),
  thisMonthUsers: z.number().int().nonnegative(),
  lastMonthUsers: z.number().int().nonnegative(),
  totalBannedUsers: z.number().int().nonnegative(),
  totalCompletedPurchases: z.number().int().nonnegative(),
  lastMonthCompletedPurchases: z.number().int().nonnegative(),
  totalPendingPurchases: z.number().int().nonnegative(),
  totalFailedPurchases: z.number().int().nonnegative(),
  totalRefundedPurchases: z.number().int().nonnegative(),
  totalUsageTransactions: z.number().int().nonnegative(),
  lastMonthUsageTransactions: z.number().int().nonnegative(),
  totalBonusTransactions: z.number().int().nonnegative(),
  totalPurchaseTransactions: z.number().int().nonnegative(),
  lastMonthPurchaseTransactions: z.number().int().nonnegative(),
  totalRefundTransactions: z.number().int().nonnegative(),
});

export const adminUserStatsSchema = z.object({
  totalUsers: z.number().int().nonnegative(),
  totalAdmins: z.number().int().nonnegative(),
  totalBanned: z.number().int().nonnegative(),
});

export const adminUserListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  role: z.string().nullable(),
  banned: z.boolean().nullable(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
});

export const adminUsersListSchema = z.object({
  users: z.array(adminUserListItemSchema),
  total: z.number().int().nonnegative(),
});

export const adminUserDetailSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
  role: z.string().nullable(),
  banned: z.boolean().nullable(),
  banReason: z.string().nullable(),
  banExpires: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const adminSearchUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  email: z.string(),
});

export const adminWebhookEventStatusSchema = z.enum(["processing", "processed", "failed"]);

export const adminWebhookEventSchema = z.object({
  id: z.string().uuid(),
  provider: z.string(),
  providerEventId: z.string(),
  eventType: z.string(),
  paymentId: z.string().nullable(),
  signatureTimestamp: z.string().nullable(),
  sanitizedPayload: z.unknown().nullable(),
  requestId: z.string().nullable(),
  correlationId: z.string().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  processingStatus: adminWebhookEventStatusSchema,
  errorDetails: z.unknown().nullable(),
  processedAt: z.string().nullable(),
  failedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const adminWebhookEventsListSchema = z.object({
  events: z.array(adminWebhookEventSchema),
  total: z.number().int().nonnegative(),
});

export const adminWebhookStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  processing: z.number().int().nonnegative(),
  processed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export const adminJobStatusSchema = z.enum(["idle", "running", "disabled"]);
export const adminJobRunStatusSchema = z.enum(["success", "failed"]);
export const adminPendingEmailStatusSchema = z.enum(["pending", "sending", "sent", "failed"]);

export const adminJobSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: adminJobStatusSchema,
  intervalSeconds: z.number().int().nonnegative(),
  nextRunAt: z.string(),
  lockedAt: z.string().nullable(),
  lockedBy: z.string().nullable(),
  lastRunAt: z.string().nullable(),
  lastSuccessAt: z.string().nullable(),
  lastFailureAt: z.string().nullable(),
  lastError: z.string().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const adminJobRunSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string(),
  jobName: z.string(),
  status: adminJobRunStatusSchema,
  startedAt: z.string(),
  finishedAt: z.string(),
  durationMs: z.number().int().nonnegative(),
  result: z.unknown().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
});

export const adminPendingEmailSchema = z.object({
  id: z.string().uuid(),
  to: z.string(),
  subject: z.string(),
  html: z.string(),
  text: z.string().nullable(),
  status: adminPendingEmailStatusSchema,
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().nonnegative(),
  nextAttemptAt: z.string(),
  sentAt: z.string().nullable(),
  failedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  providerMessageId: z.string().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const adminJobsListSchema = z.object({
  jobs: z.array(adminJobSchema),
  total: z.number().int().nonnegative(),
});

export const adminJobRunsListSchema = z.object({
  runs: z.array(adminJobRunSchema),
  total: z.number().int().nonnegative(),
});

export const adminPendingEmailsListSchema = z.object({
  emails: z.array(adminPendingEmailSchema),
  total: z.number().int().nonnegative(),
});

export const adminOperationsStatsSchema = z.object({
  jobs: z.object({
    total: z.number().int().nonnegative(),
    idle: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
    disabled: z.number().int().nonnegative(),
    failedRuns: z.number().int().nonnegative(),
  }),
  emails: z.object({
    total: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    sending: z.number().int().nonnegative(),
    sent: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
});

export const adminDashboardStatsResponseSchema = successResultSchema(adminDashboardStatsSchema);
export const adminUsersListResponseSchema = successResultSchema(adminUsersListSchema);
export const adminUserStatsResponseSchema = successResultSchema(adminUserStatsSchema);
export const adminUserDetailResponseSchema = successResultSchema(adminUserDetailSchema);
export const adminUserCreditBalanceResponseSchema = successResultSchema(creditBalanceSchema);
export const adminUserCreditHistoryResponseSchema = successResultSchema(z.array(creditTransactionSchema));
export const adminUserCreditPurchasesResponseSchema = successResultSchema(z.array(creditPurchaseSchema));
export const adminSearchUsersResponseSchema = successResultSchema(z.array(adminSearchUserSchema));
export const adminWebhookEventsListResponseSchema = successResultSchema(adminWebhookEventsListSchema);
export const adminWebhookStatsResponseSchema = successResultSchema(adminWebhookStatsSchema);
export const adminWebhookEventDetailResponseSchema = successResultSchema(adminWebhookEventSchema);
export const adminJobsListResponseSchema = successResultSchema(adminJobsListSchema);
export const adminJobRunsListResponseSchema = successResultSchema(adminJobRunsListSchema);
export const adminPendingEmailsListResponseSchema = successResultSchema(adminPendingEmailsListSchema);
export const adminOperationsStatsResponseSchema = successResultSchema(adminOperationsStatsSchema);

export type AdminDashboardStats = z.infer<typeof adminDashboardStatsSchema>;
export type AdminUsersList = z.infer<typeof adminUsersListSchema>;
export type AdminUserStats = z.infer<typeof adminUserStatsSchema>;
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;
export type AdminUserListItem = z.infer<typeof adminUserListItemSchema>;
export type AdminSearchUser = z.infer<typeof adminSearchUserSchema>;
export type AdminWebhookEventStatus = z.infer<typeof adminWebhookEventStatusSchema>;
export type AdminWebhookEvent = z.infer<typeof adminWebhookEventSchema>;
export type AdminWebhookEventsList = z.infer<typeof adminWebhookEventsListSchema>;
export type AdminWebhookStats = z.infer<typeof adminWebhookStatsSchema>;
export type AdminJobStatus = z.infer<typeof adminJobStatusSchema>;
export type AdminJobRunStatus = z.infer<typeof adminJobRunStatusSchema>;
export type AdminPendingEmailStatus = z.infer<typeof adminPendingEmailStatusSchema>;
export type AdminJob = z.infer<typeof adminJobSchema>;
export type AdminJobRun = z.infer<typeof adminJobRunSchema>;
export type AdminPendingEmail = z.infer<typeof adminPendingEmailSchema>;
export type AdminJobsList = z.infer<typeof adminJobsListSchema>;
export type AdminJobRunsList = z.infer<typeof adminJobRunsListSchema>;
export type AdminPendingEmailsList = z.infer<typeof adminPendingEmailsListSchema>;
export type AdminOperationsStats = z.infer<typeof adminOperationsStatsSchema>;
