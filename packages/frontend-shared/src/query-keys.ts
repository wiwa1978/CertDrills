export const queryKeys = {
  me: {
    applicationConfig: ["me", "application-config"] as const,
    subscription: ["me", "subscription"] as const,
  },
  credits: {
    balance: ["me", "credits", "balance"] as const,
    history: (limit: number) => ["me", "credits", "history", limit] as const,
    purchases: (limit: number) => ["me", "credits", "purchases", limit] as const,
  },
  notifications: {
    list: (limit: number) => ["me", "notifications", limit] as const,
    unreadCount: ["me", "notifications", "unread-count"] as const,
    activeBanner: ["me", "notifications", "active-banner"] as const,
  },
};
