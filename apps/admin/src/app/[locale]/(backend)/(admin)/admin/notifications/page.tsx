import { getTranslations } from "next-intl/server";
import { SendNotificationForm } from "@/components/layout/backend/admin/notifications/send-notification-form";

import { Container } from "@/components/ui/container";
import { NotificationHistoryTable } from "@/components/layout/backend/admin/notifications/notification-history-table";
import { getAllNotifications } from "@/lib/services/notifications";

export default async function AdminNotificationsPage() {
  const t = await getTranslations("admin.notifications");
  
  // Fetch all notifications from the database
  const result = await getAllNotifications(100);
  const notifications = result.success && result.data ? result.data : [];

  return (
    <Container className="py-6">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground mt-2">{t("description")}</p>
        </div>
          <SendNotificationForm />
      </div>
      <div>
        <h2 className="mt-10 mb-4 text-2xl font-bold">{t("history.title")}</h2>
           <NotificationHistoryTable notifications={notifications} />
      </div>
    </Container>
  );
}
