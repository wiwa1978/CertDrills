import { queryKeys } from "@platform/frontend-shared/query-keys";

export const adminQueryKeys = {
  applicationConfig: queryKeys.me.applicationConfig,
  creditBalance: queryKeys.credits.balance,
  notifications: queryKeys.notifications.list,
  unreadNotifications: queryKeys.notifications.unreadCount,
  countries: (locale: string) => ["countries", locale] as const,
};
