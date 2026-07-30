"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { generateRandomString } from "better-auth/crypto";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { UsersTable, type User } from "@/components/layout/backend/admin/users/users-table";
import { Container } from "@/components/ui/container";
import { authConfig } from "@/config/auth";
import { useRouter } from "@/i18n/navigation";
import {
  getUsers,
  impersonateAdminUser,
  revokeAdminUserSessions,
  setAdminUserPassword,
  setAdminUserRole,
  unbanAdminUser,
} from "@/lib/services/admin";

const ADMINS_QUERY_KEY = "admin-admins";

function promptAdminSecret() {
  const secret = window.prompt("Enter admin secret to continue.");
  return secret?.trim() || null;
}

export default function AdminAdminsPage() {
  const t = useTranslations("admin.admins");
  const tSuccess = useTranslations("admin.success");
  const tErrors = useTranslations("admin.errors");
  const router = useRouter();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = React.useState("");
  const [submittedSearch, setSubmittedSearch] = React.useState("");
  const [currentPage, setCurrentPage] = React.useState(1);
  const limit = authConfig.adminPaginationLimit;
  const offset = (currentPage - 1) * limit;

  const adminsQuery = useQuery({
    queryKey: [ADMINS_QUERY_KEY, currentPage, limit, submittedSearch],
    queryFn: async () => {
      const result = await getUsers(limit, offset, submittedSearch, "admin");
      if (result.error) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });

  const refreshAdmins = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [ADMINS_QUERY_KEY] });
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
      await refreshAdmins();
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
      await refreshAdmins();
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
      toast.success(t("passwordUpdated"));
    },
    onError: () => {
      toast.error(t("passwordUpdateFailed"));
    },
  });

  const admins = (adminsQuery.data?.users ?? []) as User[];
  const totalAdmins = adminsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalAdmins / limit));
  const from = totalAdmins > 0 ? offset + 1 : 0;
  const to = Math.min(offset + admins.length, totalAdmins);

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

      <UsersTable
        users={admins}
        loading={adminsQuery.isLoading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={handleSearch}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        displayTotal={totalAdmins}
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
          void refreshAdmins();
        }}
      />
    </Container>
  );
}
