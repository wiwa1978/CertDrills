"use client";

import * as React from "react";
import {
  MoreHorizontal,
  Shield,
  ShieldOff,
  CheckCircle,
  UserCog,
  LogOut,
  ArrowUpDown,
  Search,
  ChevronLeft,
  ChevronRight,
  KeyRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  ColumnDef,
  SortingState,
} from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/lib/auth-client";
import { BanUserDialog } from "@/components/layout/backend/admin/users/ban-user-dialog";
import { DataTable } from "@/components/ui/data-table";
import { useRouter } from "@/i18n/navigation";

export interface User {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  banned: boolean;
  emailVerified: boolean;
  createdAt: string;
}

interface UsersTableProps {
  users: User[];
  loading: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchSubmit: (e: React.FormEvent) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  displayTotal: number;
  from: number;
  to: number;
  onSetRole: (userId: string, role: "user" | "admin", options?: { reason?: string; confirmed?: boolean }) => Promise<void>;
  onUnban: (userId: string) => Promise<void>;
  onImpersonate: (userId: string) => Promise<void>;
  onRevokeSessions: (userId: string) => Promise<void>;
  onSetPassword: (userId: string) => Promise<void>;
  onRefresh: () => void;
}

export function UsersTable({
  users,
  loading,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  currentPage,
  totalPages,
  onPageChange,
  displayTotal,
  from,
  to,
  onSetRole,
  onUnban,
  onImpersonate,
  onRevokeSessions,
  onSetPassword,
  onRefresh,
}: UsersTableProps) {
  const t = useTranslations("admin.users");
  const { data: session } = useSession();
  const router = useRouter();

  const handleUserClick = (userId: string) => {
    router.push(`/admin/users/${userId}`);
  };

  const requestRoleChange = React.useCallback(async (user: User, role: "user" | "admin") => {
    if (user.role === role) {
      await onSetRole(user.id, role);
      return;
    }

    const reason = window.prompt(t("roleChange.reasonPrompt"));
    if (!reason?.trim()) {
      return;
    }

    const confirmed = user.role === "admin" && role === "user"
      ? window.confirm(t("roleChange.demoteConfirm"))
      : undefined;
    if (confirmed === false) {
      return;
    }

    await onSetRole(user.id, role, { reason: reason.trim(), ...(confirmed !== undefined ? { confirmed } : {}) });
  }, [onSetRole, t]);

  const getStatusBadge = (user: User) => {
    if (user.banned) {
      return <Badge variant="destructive">{t("status.banned")}</Badge>;
    }
    if (user.emailVerified) {
      return <Badge variant="default">{t("status.verified")}</Badge>;
    }
    return <Badge variant="secondary">{t("status.unverified")}</Badge>;
  };

  const columns: ColumnDef<User>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {t("table.name")}
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      cell: ({ row }) => {
        const user = row.original;
        return (
          <div
            className="font-medium cursor-pointer hover:text-primary hover:underline"
            onClick={() => handleUserClick(user.id)}
            title={t("viewUserDetails")}
          >
            {row.getValue("name")}
          </div>
        );
      },
    },
    {
      accessorKey: "email",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {t("table.email")}
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      cell: ({ row }) => {
        const user = row.original;
        return (
          <div
            className="cursor-pointer hover:text-primary hover:underline"
            onClick={() => handleUserClick(user.id)}
            title={t("viewUserDetails")}
          >
            {row.getValue("email")}
          </div>
        );
      },
    },
    {
      accessorKey: "role",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {t("table.role")}
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      cell: ({ row }) => (
        <Badge
          variant={row.getValue("role") === "admin" ? "default" : "secondary"}
        >
          {row.getValue("role")}
        </Badge>
      ),
    },
    {
      accessorKey: "status",
      header: t("table.status"),
      cell: ({ row }) => {
        const user = row.original;
        return getStatusBadge(user);
      },
    },
    {
      id: "actions",
      header: t("table.actions"),
      cell: ({ row }) => {
        const user = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">{t("openMenu")}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {user.role === "admin" ? (
                <DropdownMenuItem
                  onClick={() => void requestRoleChange(user, "user")}
                  disabled={user.id === session?.user?.id}
                >
                  <ShieldOff className="mr-2 h-4 w-4" />
                  {t("actions.removeAdmin")}
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem
                    onClick={() => void requestRoleChange(user, "admin")}
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    {t("actions.makeAdmin")}
                  </DropdownMenuItem>
                </>
              )}
              {(user.banned || user.role !== "admin") && (
                <>
                  <DropdownMenuSeparator />
                  {user.banned ? (
                    <DropdownMenuItem
                      onClick={() => onUnban(user.id)}
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      {t("actions.unban")}
                    </DropdownMenuItem>
                  ) : (
                    <BanUserDialog
                      userId={user.id}
                      userName={user.name}
                      onSuccess={onRefresh}
                    />
                  )}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onImpersonate(user.id)}
                disabled={user.id === session?.user?.id}
              >
                <UserCog className="mr-2 h-4 w-4" />
                {t("actions.impersonate")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onRevokeSessions(user.id)}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {t("actions.revokeSessions")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSetPassword(user.id)}>
                <KeyRound className="mr-2 h-4 w-4" />
                Set password
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <>
      {/* Search */}
      <form onSubmit={onSearchSubmit} className="mb-6 flex gap-2 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder={t("searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button type="submit">{t("search")}</Button>
      </form>

      {/* Table */}
      <DataTable
        columns={columns}
        data={users}
        loading={loading}
        loadingText={t("loading")}
        emptyText={t("noUsers")}
      />

      {/* Pagination */}
      {displayTotal > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            {t("pagination.showing", { from, to, total: displayTotal })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t("pagination.previous")}
            </Button>
            <span className="text-sm">
              {t("pagination.page", { current: currentPage, total: totalPages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
            >
              {t("pagination.next")}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
