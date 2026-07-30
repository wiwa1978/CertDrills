import { createNotificationsApi } from "@platform/frontend-shared/notifications";

import {
  getNotificationSendHistoryApi,
  searchUsersForNotificationApi,
  sendNotificationToAllUsersApi,
  sendNotificationToUsersApi,
} from "@/lib/api/admin";
import { apiRequest } from "@/lib/api/client";
import type { Notification } from "@/schemas/notification";
import type { NotificationSendHistoryItem } from "@platform/contracts";

const notificationsApi = createNotificationsApi(apiRequest);

export async function getNotifications(limit = 20) {
  try {
    const result = await notificationsApi.list(limit);
    const data = result.data;
    return { success: true, data };
  } catch {
    return { success: false, error: "Failed to fetch notifications" };
  }
}

export async function getActiveBannerNotifications() {
  try {
    const result = await notificationsApi.getActiveBanner();
    const data = result.data;
    return { success: true, data };
  } catch {
    return { success: false, data: null };
  }
}

export async function getUnreadCount() {
  try {
    const result = await notificationsApi.getUnreadCount();
    const count = result.data.count;
    return { success: true, count };
  } catch {
    return { success: false, count: 0 };
  }
}

export async function markAsRead(notificationId: string) {
  try {
    await notificationsApi.markAsRead(notificationId);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to mark as read" };
  }
}

export async function markAllAsRead() {
  try {
    await notificationsApi.markAllAsRead();
    return { success: true };
  } catch {
    return { success: false, error: "Failed to mark all as read" };
  }
}

export async function createNotification({
  userId,
  title,
  message,
  type = "info",
  category,
  data,
  showAsBanner = false,
  bannerExpiresAt,
}: {
  userId: string;
  title: string;
  message: string;
  type?: "info" | "warning" | "success" | "error";
  category: string;
  data?: Record<string, unknown>;
  showAsBanner?: boolean;
  bannerExpiresAt?: Date;
}) {
  try {
    const result = await sendNotificationToUsersApi({
      userIds: [userId],
      title,
      message,
      type,
      category,
      data,
      showAsBanner,
      bannerExpiresAt,
      secret: "",
    });

    if (result.data.sentCount !== 1 || result.data.invalidRecipientCount > 0) {
      return { success: false, error: "Failed to create notification" };
    }

    return { success: true, data: null };
  } catch {
    return { success: false, error: "Failed to create notification" };
  }
}

export async function deleteNotification(notificationId: string) {
  try {
    await notificationsApi.delete(notificationId);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete notification" };
  }
}

export async function sendNotificationToAllUsers({
  title,
  message,
  type = "info",
  category = "system",
  data,
  showAsBanner = false,
  bannerExpiresAt,
  secret,
}: {
  title: string;
  message: string;
  type?: "info" | "warning" | "success" | "error";
  category?: string;
  data?: Record<string, unknown>;
  showAsBanner?: boolean;
  bannerExpiresAt?: Date;
  secret: string;
}) {
  try {
    const result = await sendNotificationToAllUsersApi({
      title,
      message,
      type,
      category,
      data,
      showAsBanner,
      bannerExpiresAt,
      secret,
    });

    return { success: true as const, ...result.data };
  } catch {
    return { success: false as const, error: "Failed to send notification to all users" };
  }
}

export async function sendNotificationToUsers({
  userIds,
  title,
  message,
  type = "info",
  category = "system",
  data,
  showAsBanner = false,
  bannerExpiresAt,
  secret,
}: {
  userIds: string[];
  title: string;
  message: string;
  type?: "info" | "warning" | "success" | "error";
  category?: string;
  data?: Record<string, unknown>;
  showAsBanner?: boolean;
  bannerExpiresAt?: Date;
  secret: string;
}) {
  try {
    const result = await sendNotificationToUsersApi({
      userIds,
      title,
      message,
      type,
      category,
      data,
      showAsBanner,
      bannerExpiresAt,
      secret,
    });

    return { success: true as const, ...result.data };
  } catch {
    return { success: false as const, error: "Failed to send notification to users" };
  }
}

export async function getAllNotifications(limit = 50) {
  return getNotificationSendHistory(limit);
}

export async function getNotificationSendHistory(limit = 50) {
  try {
    const data = await getNotificationSendHistoryApi(limit);
    return { success: true, data };
  } catch {
    return { success: false, error: "Failed to fetch notification send history" };
  }
}

export async function searchUsersForNotification(query: string, limit = 20) {
  return searchUsersForNotificationApi(query, limit);
}
