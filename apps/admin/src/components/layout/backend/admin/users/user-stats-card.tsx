import { Users, Shield, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatCard } from "@/components/layout/backend/shared/stat-card";

interface UserStatsCardProps {
  totalUsers: number;
  totalAdmins: number;
  totalBanned: number;
}

export function UserStatsCard({
  totalUsers,
  totalAdmins,
  totalBanned,
}: UserStatsCardProps) {
  const t = useTranslations("admin.users.stats");

  const totalRegularUsers = totalUsers - totalAdmins;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <StatCard
        title={t("totalUsers")}
        value={totalUsers}
        icon={Users}
      />

      <StatCard
        title={t("adminVsUser")}
        value={
          <>
            {totalAdmins} {totalAdmins === 1 ? t("admin") : t("admins")} |{" "}
            {totalRegularUsers} {totalRegularUsers === 1 ? t("user") : t("users")}
          </>
        }
        icon={Shield}
      />

      <StatCard
        title={t("bannedUsers")}
        value={totalBanned}
        icon={ShieldAlert}
      />
    </div>
  );
}
