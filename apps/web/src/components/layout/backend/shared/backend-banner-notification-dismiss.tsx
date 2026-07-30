"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { authConfig } from "@/config/auth";
import { webQueryKeys } from "@/lib/query/keys";
import { markAsRead } from "@/lib/services/notifications";

export function BackendBannerNotificationDismiss({ notificationId }: { notificationId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  async function dismiss() {
    await markAsRead(notificationId);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: webQueryKeys.notifications(authConfig.notificationsDropdownLimit) }),
      queryClient.invalidateQueries({ queryKey: webQueryKeys.unreadNotifications }),
    ]);
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Dismiss notification"
      className="text-amber-950 hover:bg-amber-100 hover:text-amber-950"
      onClick={dismiss}
    >
      <X className="size-4" />
    </Button>
  );
}
