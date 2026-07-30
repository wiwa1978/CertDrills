"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { markAsRead } from "@/lib/services/notifications";

export function BackendBannerNotificationDismiss({ notificationId }: { notificationId: string }) {
  const router = useRouter();

  async function dismiss() {
    await markAsRead(notificationId);
    window.dispatchEvent(new Event("notifications:changed"));
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
