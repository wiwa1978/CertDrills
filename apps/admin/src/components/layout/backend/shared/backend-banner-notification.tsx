import { getTranslations } from "next-intl/server";

import { translateNotification } from "@/lib/notifications";
import { getActiveBannerNotificationsServer } from "@/lib/api/me.server";
import { BackendBannerNotificationDismiss } from "./backend-banner-notification-dismiss";

export async function BackendBannerNotification({ locale }: { locale: string }) {
  const result = await getActiveBannerNotificationsServer();
  const banner = result.success ? result.data : null;

  if (!banner) {
    return null;
  }

  const bannerId = banner.id;
  const t = await getTranslations("notifications");
  const { title, message } = translateNotification(
    banner.title,
    banner.message,
    { ...banner.data, userLocale: locale },
    t as (key: string, values?: Record<string, unknown>) => string
  );

  return (
    <div className="mb-6 border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-amber-900">{message}</p>
        </div>
        <BackendBannerNotificationDismiss notificationId={bannerId} />
      </div>
    </div>
  );
}
