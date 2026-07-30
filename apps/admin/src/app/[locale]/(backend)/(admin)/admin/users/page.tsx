"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { generateRandomString } from "better-auth/crypto";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { UserStatsCard } from "@/components/layout/backend/admin/users/user-stats-card";
import { UsersTable, User } from "@/components/layout/backend/admin/users/users-table";
import { Container } from "@/components/ui/container";
import { authConfig } from "@/config/auth";
import { useRouter } from "@/i18n/navigation";
import {
  getAdminUserStats,
  getUsers,
  impersonateAdminUser,
  revokeAdminUserSessions,
  setAdminUserPassword,
  setAdminUserRole,
  unbanAdminUser,
} from "@/lib/services/admin";

const USERS_QUERY_KEY = "admin-users";
const USER_STATS_QUERY_KEY = "admin-user-stats";

function promptAdminSecret() {
  const secret = window.prompt("Enter admin secret to continue.");
  return secret?.trim() || null;
}

export default function AdminUsersPage() {
  const t = useTranslations("admin.users");
  const tSuccess = useTranslations("admin.success");
  const tErrors = useTranslations("admin.errors");
  const router = useRouter();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = React.useState("");
  const [submittedSearch, setSubmittedSearch] = React.useState("");
  const [currentPage, setCurrentPage] = React.useState(1);
  const limit = authConfig.adminPaginationLimit;
  const offset = (currentPage - 1) * limit;

  const usersQuery = useQuery({
    queryKey: [USERS_QUERY_KEY, currentPage, limit, submittedSearch],
    queryFn: async () => {
      const result = await getUsers(limit, offset, submittedSearch);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });

  const statsQuery = useQuery({
    queryKey: [USER_STATS_QUERY_KEY],
    queryFn: getAdminUserStats,
  });

  const refreshUsers = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [USERS_QUERY_KEY] });
  }, [queryClient]);

  const refreshStats = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [USER_STATS_QUERY_KEY] });
  }, [queryClient]);

  const setRoleMutation = useMutation({
    mutationFn: async ({ userId, role, reason, confirmed, secret }: { userId: string; role: "user" | "admin"; reason?: string; confirmed?: boolean; secret: string }) => {
      const result = await setAdminUserRole(userId, role, { reason, confirmed, secret });
      if ((result as { error?: unknown }).error) {
        throw new Error(tErrors("roleUpdateFailed"));
      }
      return result;
    },
    onSuccess: async () => {
      toast.success(tSuccess("roleUpdated"));
      await Promise.all([refreshUsers(), refreshStats()]);
    },
    onError: () => {
      toast.error(tErrors("roleUpdateFailed"));
    },
  });

  const unbanMutation = useMutation({
    mutationFn: async ({ userId, secret }: { userId: string; secret: string }) => {
      const result = await unbanAdminUser(userId, secret);
      if ((result as { error?: unknown }).error) {
        throw new Error(tErrors("unbanFailed"));
      }
      return result;
    },
    onSuccess: async () => {
      toast.success(tSuccess("userUnbanned"));
      await refreshUsers();
    },
    onError: () => {
      toast.error(tErrors("unbanFailed"));
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: async ({ userId, secret }: { userId: string; secret: string }) => {
      const result = await impersonateAdminUser(userId, secret);
      if ((result as { error?: unknown }).error) {
        throw new Error(tErrors("impersonateFailed"));
      }
      return result;
    },
    onSuccess: () => {
      toast.success(tSuccess("impersonating"));
      router.push("/admin/overview");
      router.refresh();
    },
    onError: () => {
      toast.error(tErrors("impersonateFailed"));
    },
  });

  const revokeSessionsMutation = useMutation({
    mutationFn: async ({ userId, secret }: { userId: string; secret: string }) => {
      const result = await revokeAdminUserSessions(userId, secret);
      if ((result as { error?: unknown }).error) {
        throw new Error(tErrors("revokeSessionsFailed"));
      }
      return result;
    },
    onSuccess: () => {
      toast.success(tSuccess("sessionsRevoked"));
    },
    onError: () => {
      toast.error(tErrors("revokeSessionsFailed"));
    },
  });

  const setPasswordMutation = useMutation({
    mutationFn: async ({ userId, secret }: { userId: string; secret: string }) => {
      const password = generateRandomString(16);
      const result = await setAdminUserPassword(userId, password, secret);
      if ((result as { error?: unknown }).error) {
        throw new Error("Failed to set password");
      }

      return password;
    },
    onSuccess: async (password) => {
      await navigator.clipboard.writeText(password).catch(() => undefined);
      toast.success("Password updated. New password copied to clipboard.");
    },
    onError: () => {
      toast.error("Failed to set password");
    },
  });

  const users = (usersQuery.data?.users ?? []) as User[];

  const filteredTotalUsers = usersQuery.data?.total ?? 0;
  const statsTotalUsers = statsQuery.data?.totalUsers ?? 0;
  const totalAdmins = statsQuery.data?.totalAdmins ?? 0;
  const totalBanned = statsQuery.data?.totalBanned ?? 0;
  const displayTotal = filteredTotalUsers;
  const totalPages = Math.max(1, Math.ceil(filteredTotalUsers / limit));
  const from = filteredTotalUsers > 0 ? offset + 1 : 0;
  const to = Math.min(offset + users.length, filteredTotalUsers);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    setSubmittedSearch(searchQuery.trim());
  };

  return (
    <Container className="py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("description")}</p>
      </div>

      <UserStatsCard totalUsers={statsTotalUsers} totalAdmins={totalAdmins} totalBanned={totalBanned} />

      <UsersTable
        users={users}
        loading={usersQuery.isLoading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={handleSearch}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        displayTotal={displayTotal}
        from={from}
        to={to}
        onSetRole={(userId, role, options) => {
          const secret = promptAdminSecret();
          return secret ? setRoleMutation.mutateAsync({ userId, role, ...options, secret }).then(() => undefined) : Promise.resolve();
        }}
        onUnban={(userId) => {
          const secret = promptAdminSecret();
          return secret ? unbanMutation.mutateAsync({ userId, secret }).then(() => undefined) : Promise.resolve();
        }}
        onImpersonate={(userId) => {
          const secret = promptAdminSecret();
          return secret ? impersonateMutation.mutateAsync({ userId, secret }).then(() => undefined) : Promise.resolve();
        }}
        onRevokeSessions={(userId) => {
          const secret = promptAdminSecret();
          return secret ? revokeSessionsMutation.mutateAsync({ userId, secret }).then(() => undefined) : Promise.resolve();
        }}
        onSetPassword={(userId) => {
          const secret = promptAdminSecret();
          return secret ? setPasswordMutation.mutateAsync({ userId, secret }).then(() => undefined) : Promise.resolve();
        }}
        onRefresh={() => {
          void refreshUsers();
        }}
      />
    </Container>
  );
}
