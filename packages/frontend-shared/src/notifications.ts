import type { Notification, SuccessResult } from "@platform/contracts";

import type { ApiRequest } from "./credits";

type MarkReadResponse = SuccessResult<{ marked: boolean }>;
type DeleteNotificationResponse = SuccessResult<{ deleted: boolean }>;

export function createNotificationsApi(apiRequest: ApiRequest) {
  return {
    async list(limit = 20) {
      return apiRequest<SuccessResult<Notification[]>>(`/me/notifications?limit=${limit}`);
    },
    async getUnreadCount() {
      return apiRequest<SuccessResult<{ count: number }>>("/me/notifications/unread-count");
    },
    async getActiveBanner() {
      return apiRequest<SuccessResult<Notification | null>>("/me/notifications/active-banner");
    },
    async markAsRead(notificationId: string) {
      return apiRequest<MarkReadResponse>(`/me/notifications/${notificationId}/read`, {
        method: "POST",
      });
    },
    async markAllAsRead() {
      return apiRequest<MarkReadResponse>("/me/notifications/read-all", {
        method: "POST",
      });
    },
    async delete(notificationId: string) {
      return apiRequest<DeleteNotificationResponse>(`/me/notifications/${notificationId}`, {
        method: "DELETE",
      });
    },
  };
}
