import { queryKeys } from "@platform/frontend-shared/query-keys";

export const webQueryKeys = {
  applicationConfig: queryKeys.me.applicationConfig,
  subscription: queryKeys.me.subscription,
  creditBalance: queryKeys.credits.balance,
  notifications: queryKeys.notifications.list,
  unreadNotifications: queryKeys.notifications.unreadCount,
  dataExports: ["me", "dataExports"] as const,
  countries: (locale: string) => ["countries", locale] as const,
};
