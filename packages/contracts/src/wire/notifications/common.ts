import { z } from "zod";

export const notificationTypeSchema = z.enum(["info", "warning", "success", "error"]);
export const notificationCategorySchema = z.enum(["security", "account", "billing", "usage", "system"]);

export const notificationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  message: z.string(),
  type: notificationTypeSchema,
  category: notificationCategorySchema,
  read: z.boolean(),
  showAsBanner: z.boolean(),
  bannerExpiresAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  data: z.record(z.string(), z.unknown()).nullable(),
});

export const sendNotificationSchema = z.object({
  titleEn: z.string().min(1, "English title is required").max(100, "Title is too long"),
  messageEn: z.string().min(1, "English message is required").max(500, "Message is too long"),
  titleNl: z.string().min(1, "Dutch title is required").max(100, "Title is too long"),
  messageNl: z.string().min(1, "Dutch message is required").max(500, "Message is too long"),
  titleFr: z.string().min(1, "French title is required").max(100, "Title is too long"),
  messageFr: z.string().min(1, "French message is required").max(500, "Message is too long"),
  type: notificationTypeSchema,
  category: notificationCategorySchema,
  showAsBanner: z.boolean(),
  bannerExpiresAt: z.date().optional(),
});

export const sendNotificationBaseSchema = z.object({
  title: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(1000),
  type: notificationTypeSchema.optional(),
  category: z.string().trim().min(1).max(100).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  showAsBanner: z.boolean().optional(),
  bannerExpiresAt: z.coerce.date().optional(),
});

export const sendNotificationToUsersSchema = sendNotificationBaseSchema.extend({
  userIds: z.array(z.string().uuid()).min(1).max(500),
});

export const notificationSendResultSchema = z.object({
  sentCount: z.number().int().min(0),
  skippedCount: z.number().int().min(0),
  invalidRecipientCount: z.number().int().min(0),
  invalidRecipientIds: z.array(z.string().uuid()),
});

export const notificationSendHistoryItemSchema = z.object({
  id: z.string(),
  action: z.string(),
  batchId: z.string().nullable(),
  actorId: z.string().nullable(),
  scope: z.enum(["all", "selected"]),
  title: z.string(),
  message: z.string(),
  sentCount: z.number().int().min(0),
  skippedCount: z.number().int().min(0),
  invalidRecipientCount: z.number().int().min(0),
  invalidRecipientIds: z.array(z.string()),
  createdAt: z.string(),
});

export type Notification = z.infer<typeof notificationSchema>;
export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type NotificationCategory = z.infer<typeof notificationCategorySchema>;
export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;
export type NotificationSendResult = z.infer<typeof notificationSendResultSchema>;
export type NotificationSendHistoryItem = z.infer<typeof notificationSendHistoryItemSchema>;

export interface TranslateFunction {
  (key: string, values?: Record<string, unknown>): string;
}

export interface TranslatedNotification {
  title: string;
  message: string;
}
