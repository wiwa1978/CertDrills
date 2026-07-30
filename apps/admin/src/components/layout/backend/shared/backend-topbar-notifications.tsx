"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Bell, Check, Trash2, X } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { formatDistanceToNow } from "date-fns";
import { translateNotification } from "@/lib/notifications";
import type { Notification } from "@/schemas/notification";
import { Button } from "@/components/ui/button";
import { authConfig } from "@/config/auth";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  deleteNotification,
  getNotifications,
  getUnreadCount,
  markAllAsRead,
  markAsRead,
} from "@/lib/services/notifications";
import { useSession } from "@/lib/auth-client";
import { adminQueryKeys } from "@/lib/query/keys";

export function BackendTopbarNotifications() {
  const t = useTranslations("notifications");
  const locale = useLocale();
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = React.useState(false);
  const queryClient = useQueryClient();
  const notificationsQueryKey = adminQueryKeys.notifications(authConfig.notificationsDropdownLimit);

  const notificationsQuery = useQuery({
    queryKey: notificationsQueryKey,
    queryFn: async () => {
      const result = await getNotifications(authConfig.notificationsDropdownLimit);
      return result.success && result.data ? result.data as Notification[] : [];
    },
    enabled: Boolean(session?.user?.id),
    refetchInterval: authConfig.notificationsPollingInterval > 0 ? authConfig.notificationsPollingInterval : false,
  });

  const unreadCountQuery = useQuery({
    queryKey: adminQueryKeys.unreadNotifications,
    queryFn: async () => {
      const result = await getUnreadCount();
      return result.success ? result.count : 0;
    },
    enabled: Boolean(session?.user?.id),
    refetchInterval: authConfig.notificationsPollingInterval > 0 ? authConfig.notificationsPollingInterval : false,
  });

  const refreshNotifications = React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: notificationsQueryKey }),
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.unreadNotifications }),
    ]);
  }, [notificationsQueryKey, queryClient]);

  React.useEffect(() => {
    window.addEventListener("notifications:changed", refreshNotifications);
    return () => window.removeEventListener("notifications:changed", refreshNotifications);
  }, [refreshNotifications]);

  const markAsReadMutation = useMutation({ mutationFn: markAsRead, onSuccess: refreshNotifications });
  const markAllAsReadMutation = useMutation({ mutationFn: markAllAsRead, onSuccess: refreshNotifications });
  const deleteMutation = useMutation({ mutationFn: deleteNotification, onSuccess: refreshNotifications });

  const handleMarkAsRead = async (notificationId: string) => {
    if (!session?.user?.id) return;
    await markAsReadMutation.mutateAsync(notificationId);
  };

  const handleMarkAllAsRead = async () => {
    if (!session?.user?.id) return;
    await markAllAsReadMutation.mutateAsync();
  };

  const handleDelete = async (notificationId: string) => {
    if (!session?.user?.id) return;
    await deleteMutation.mutateAsync(notificationId);
  };

  if (!session?.user) return null;

  const notifications = notificationsQuery.data ?? [];
  const unreadCount = unreadCountQuery.data ?? 0;
  const isLoading = notificationsQuery.isLoading || unreadCountQuery.isLoading;

  const getTypeColor = (type: Notification["type"]) => {
    switch (type) {
      case "error":
        return "text-destructive";
      case "warning":
        return "text-yellow-600 dark:text-yellow-500";
      case "success":
        return "text-green-600 dark:text-green-500";
      default:
        return "text-blue-600 dark:text-blue-500";
    }
  };

  return (
    <Popover 
      open={isOpen} 
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) {
          void refreshNotifications();
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
          <span className="sr-only">{t("title")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold">{t("title")}</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllAsRead}
              className="h-8 text-xs"
            >
              <Check className="mr-1 h-3 w-3" />
              {t("markAllRead")}
            </Button>
          )}
        </div>

        <div className="max-h-100 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              {t("loading")}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => {
                // Add user's current locale to data for translation
                const dataWithLocale = {
                  ...notification.data,
                  userLocale: locale,
                };
                
                const { title, message } = translateNotification(
                  notification.title,
                  notification.message,
                  dataWithLocale,
                  t as (key: string, values?: Record<string, unknown>) => string
                );
                
                return (
                  <div
                    key={notification.id}
                    className={cn(
                      "group relative px-4 py-3 transition-colors hover:bg-muted/50",
                      !notification.read && "bg-primary/5"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "mt-0.5 h-2 w-2 rounded-full shrink-0",
                          !notification.read ? "bg-primary" : "bg-transparent"
                        )}
                      />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={cn(
                              "text-sm font-medium",
                              getTypeColor(notification.type)
                            )}
                          >
                            {title}
                          </p>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!notification.read && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleMarkAsRead(notification.id)}
                              >
                                <Check className="h-3 w-3" />
                                <span className="sr-only">{t("markRead")}</span>
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleDelete(notification.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                              <span className="sr-only">{t("delete")}</span>
                            </Button>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {message}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(notification.createdAt), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
