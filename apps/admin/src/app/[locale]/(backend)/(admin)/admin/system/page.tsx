import { Activity, Database, FileText, ShieldCheck, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAdminSystemHealth } from "@/lib/services/admin";
import {
  getAdminDashboardStatsServer,
  getAdminApplicationSettingsServer,
  getAdminLogFilesServer,
  getAdminUserStatsServer,
} from "@/lib/api/admin.server";
import { RuntimeSettingsCard } from "@/components/layout/backend/admin/system/runtime-settings-card";

export default async function AdminSystemPage() {
  const t = await getTranslations("admin.system");
  const [health, dashboardStats, userStats, appLogs, auditLogs, runtimeSettings] = await Promise.all([
    getAdminSystemHealth(),
    getAdminDashboardStatsServer(),
    getAdminUserStatsServer().catch(() => ({
      totalUsers: 0,
      totalAdmins: 0,
      totalBanned: 0,
    })),
    getAdminLogFilesServer("app").catch(() => ({ files: [], selectedFile: null })),
    getAdminLogFilesServer("audit").catch(() => ({ files: [], selectedFile: null })),
    getAdminApplicationSettingsServer(),
  ]);
  const isHealthy = health.status === "ok";

  return (
    <Container className="py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("description")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("health.title")}</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={isHealthy ? "default" : "destructive"}>{isHealthy ? t("health.ok") : t("health.unavailable")}</Badge>
            <p className="mt-2 text-xs text-muted-foreground">{t("health.description")}</p>
          </CardContent>
        </Card>

        <MetricCard title={t("metrics.totalUsers")} value={userStats.totalUsers} icon={<Users className="h-4 w-4 text-muted-foreground" />} />
        <MetricCard title={t("metrics.admins")} value={userStats.totalAdmins} icon={<ShieldCheck className="h-4 w-4 text-muted-foreground" />} />
        <MetricCard title={t("metrics.bannedUsers")} value={userStats.totalBanned} icon={<Database className="h-4 w-4 text-muted-foreground" />} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("activity.title")}</CardTitle>
            <CardDescription>{t("activity.description")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <MetricBlock label={t("activity.thisMonthUsers")} value={dashboardStats.thisMonthUsers ?? 0} />
            <MetricBlock label={t("activity.completedPurchases")} value={dashboardStats.totalCompletedPurchases ?? 0} />
            <MetricBlock label={t("activity.pendingPurchases")} value={dashboardStats.totalPendingPurchases ?? 0} />
            <MetricBlock label={t("activity.usageTransactions")} value={dashboardStats.totalUsageTransactions ?? 0} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("logs.title")}</CardTitle>
            <CardDescription>{t("logs.description")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <LogBlock label={t("logs.app")} files={appLogs.files.length} selectedFile={appLogs.selectedFile} />
            <LogBlock label={t("logs.audit")} files={auditLogs.files.length} selectedFile={auditLogs.selectedFile} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <RuntimeSettingsCard settings={runtimeSettings} />
      </div>
    </Container>
  );
}

function MetricCard({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}

function MetricBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}

function LogBlock({ label, files, selectedFile }: { label: string; files: number; selectedFile: string | null }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <p className="font-medium">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold">{files.toLocaleString()}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{selectedFile ?? "-"}</p>
    </div>
  );
}
