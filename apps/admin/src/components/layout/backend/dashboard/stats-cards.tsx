import { useTranslations } from "next-intl";
import { StatCard } from "@/components/layout/backend/shared/stat-card";

export function StatsCards() {
    const t = useTranslations("dashboard");
    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
                title={t("stats.totalUsers")}
                value="1,234"
                description={t("stats.totalUsersChange")}
            />
            <StatCard
                title={t("stats.activeProjects")}
                value="23"
                description={t("stats.activeProjectsChange")}
            />
            <StatCard
                title={t("stats.revenue")}
                value="$12,345"
                description={t("stats.revenueChange")}
            />
            <StatCard
                title={t("stats.conversionRate")}
                value="3.2%"
                description={t("stats.conversionRateChange")}
            />
        </div>
    )
}
