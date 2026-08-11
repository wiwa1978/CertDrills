import type { Notification, SuccessResult } from "@platform/contracts";
import { apiRoutes } from "@platform/contracts/ts";

import type { ApiRequest } from "./credits";

type MarkReadResponse = SuccessResult<{ marked: boolean }>;
type DeleteNotificationResponse = SuccessResult<{ deleted: boolean }>;

export function createNotificationsApi(apiRequest: ApiRequest) {
  return {
    async list(limit = 20) {
      return apiRequest<SuccessResult<Notification[]>>(apiRoutes.me.notifications(limit));
    },
    async getUnreadCount() {
      return apiRequest<SuccessResult<{ count: number }>>(apiRoutes.me.unreadNotificationsCount);
    },
    async getActiveBanner() {
      return apiRequest<SuccessResult<Notification | null>>(apiRoutes.me.activeBannerNotification);
    },
    async markAsRead(notificationId: string) {
      return apiRequest<MarkReadResponse>(apiRoutes.me.markNotificationRead(notificationId), {
        method: "POST",
      });
    },
    async markAllAsRead() {
      return apiRequest<MarkReadResponse>(apiRoutes.me.markAllNotificationsRead, {
        method: "POST",
      });
    },
    async delete(notificationId: string) {
      return apiRequest<DeleteNotificationResponse>(apiRoutes.me.deleteNotification(notificationId), {
        method: "DELETE",
      });
    },
  };
}
