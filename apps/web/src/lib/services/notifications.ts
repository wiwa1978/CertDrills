import { createNotificationsApi } from "@platform/frontend-shared/notifications";

import { apiRequest } from "@/lib/api/client";
import type { Notification } from "@/schemas/notification";

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

export async function deleteNotification(notificationId: string) {
  try {
    await notificationsApi.delete(notificationId);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete notification" };
  }
}
