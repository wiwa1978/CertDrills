"use client";

 import * as React from "react";
import { format } from "date-fns";
 import { Filter, Pencil, Plus, Search } from "lucide-react";
 import { useForm } from "react-hook-form";
 import { useTranslations } from "next-intl";
 import { toast } from "sonner";

import { createVoucherSchema, type VoucherAssignmentScope } from "@platform/contracts";

 import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
 } from "@/components/ui/form";
 import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
 } from "@/components/ui/table";
import { cn } from "@/lib/utils";
 import { UserMultiSelect } from "./user-multi-select";
import {
  createVoucher,
  getVouchers,
  searchUsersForVoucher,
  updateVoucher,
  updateVoucherStatus,
  type VoucherFormData,
  type VoucherStatus,
  type VoucherWithUsers,
} from "@/lib/services/vouchers";

type VoucherFormValues = {
  code: string;
  creditAmount: number;
  assignmentScope: VoucherAssignmentScope;
  userIds: string[];
  maxRedemptions?: number;
  expiresAt?: Date | null;
  secret: string;
};

const DEFAULT_ALL_USER_VOUCHER_MAX_REDEMPTIONS = 100_000;

function getStatusVariant(status: VoucherStatus) {
  if (status === "active") return "default" as const;
  if (status === "inactive") return "secondary" as const;
  return "outline" as const;
}

export function VouchersSection() {
  const t = useTranslations("admin.vouchers");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | VoucherStatus>("all");
  const [vouchers, setVouchers] = React.useState<VoucherWithUsers[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingVoucher, setEditingVoucher] = React.useState<VoucherWithUsers | null>(null);

  const form = useForm<VoucherFormValues>({
    defaultValues: {
      code: "",
      creditAmount: 100,
      assignmentScope: "selected",
      userIds: [],
      maxRedemptions: 1,
      expiresAt: undefined,
      secret: "",
    },
  });

  const assignmentScope = form.watch("assignmentScope");
  const selectedUserIds = form.watch("userIds") ?? [];
  const isEditing = editingVoucher !== null;

  const resetCreateForm = React.useCallback(() => {
    form.reset({
      code: "",
      creditAmount: 100,
      assignmentScope: "selected",
      userIds: [],
      maxRedemptions: 1,
      expiresAt: undefined,
      secret: "",
    });
  }, [form]);

  const setEditFormValues = React.useCallback(
    (voucher: VoucherWithUsers) => {
      form.reset({
        code: voucher.code,
        creditAmount: voucher.creditAmount,
        assignmentScope: voucher.appliesToAllUsers ? "all" : "selected",
        userIds: voucher.assignedUsers?.map((assignedUser) => assignedUser.id) ?? [],
        maxRedemptions: voucher.maxRedemptions,
        expiresAt: voucher.expiresAt ? new Date(voucher.expiresAt) : null,
        secret: "",
      });
    },
    [form],
  );

  React.useEffect(() => {
    if (assignmentScope === "selected") {
      form.setValue("maxRedemptions", selectedUserIds.length > 0 ? selectedUserIds.length : undefined, {
        shouldValidate: true,
      });
      return;
    }

    if (!form.getValues("maxRedemptions")) {
      form.setValue("maxRedemptions", DEFAULT_ALL_USER_VOUCHER_MAX_REDEMPTIONS, { shouldValidate: false });
    }
  }, [assignmentScope, form, selectedUserIds.length]);

  const fetchVouchers = React.useCallback(async () => {
    setLoading(true);

    try {
      const result = await getVouchers(50, 0, searchQuery || undefined, statusFilter === "all" ? undefined : statusFilter);
      setVouchers(result.vouchers);
    } catch {
      toast.error(t("errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, t]);

  React.useEffect(() => {
    void fetchVouchers();
  }, [fetchVouchers]);

  function openCreateDialog() {
    setEditingVoucher(null);
    resetCreateForm();
    setDialogOpen(true);
  }

  function openEditDialog(voucher: VoucherWithUsers) {
    setEditingVoucher(voucher);
    setEditFormValues(voucher);
    setDialogOpen(true);
  }

  function handleDialogOpenChange(open: boolean) {
    setDialogOpen(open);

    if (!open) {
      setEditingVoucher(null);
      resetCreateForm();
    }
  }

  async function onSubmit(values: VoucherFormValues) {
    if (!values.secret.trim()) {
      form.setError("secret", { message: t("form.secretRequired") });
      return;
    }

    const parsed = createVoucherSchema.safeParse({
      ...values,
      expiresAt: values.expiresAt ?? undefined,
    });

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        if (typeof path === "string") {
          form.setError(path as keyof VoucherFormValues, { message: issue.message });
        }
      }
      return;
    }

    const result = editingVoucher
      ? await updateVoucher({
          id: editingVoucher.id,
          ...parsed.data,
          secret: values.secret.trim(),
        })
      : await createVoucher({
          ...parsed.data,
          secret: values.secret.trim(),
        });

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(t(isEditing ? "success.updated" : "success.created"));
    handleDialogOpenChange(false);
    await fetchVouchers();
  }

  async function handleDeactivate(voucher: VoucherWithUsers) {
    if (voucher.status === "redeemed" || voucher.status === "expired") {
      toast.error(t("errors.statusLocked"));
      return;
    }

    const secret = window.prompt("Enter admin secret to update this voucher.")?.trim();
    if (!secret) {
      return;
    }

    const result = await updateVoucherStatus({
      id: voucher.id,
      status: voucher.status === "inactive" ? "active" : "inactive",
      secret,
    });

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(t("success.updated"));
    await fetchVouchers();
  }

  function renderAssignedTo(voucher: VoucherWithUsers) {
    if (voucher.appliesToAllUsers) {
      return t("table.allUsers");
    }

    const assignedUsers = voucher.assignedUsers ?? [];
    if (assignedUsers.length === 0) {
      return "-";
    }

    if (assignedUsers.length === 1) {
      return assignedUsers[0]?.email ?? assignedUsers[0]?.name ?? "-";
    }

    return t("table.selectedUsers", { count: assignedUsers.length });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>{t("title")}</CardTitle>
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            {t("actions.create")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("filters.searchPlaceholder")}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | VoucherStatus)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder={t("filters.statusPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filters.statusAll")}</SelectItem>
              <SelectItem value="active">{t("statuses.active")}</SelectItem>
              <SelectItem value="inactive">{t("statuses.inactive")}</SelectItem>
              <SelectItem value="redeemed">{t("statuses.redeemed")}</SelectItem>
              <SelectItem value="expired">{t("statuses.expired")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.code")}</TableHead>
                <TableHead>{t("table.credits")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
                <TableHead>{t("table.redemptions")}</TableHead>
                <TableHead>{t("table.assignedTo")}</TableHead>
                <TableHead>{t("table.expiresAt")}</TableHead>
                <TableHead className="text-right">{t("table.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    {t("loading")}
                  </TableCell>
                </TableRow>
              ) : vouchers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    {t("empty")}
                  </TableCell>
                </TableRow>
              ) : (
                vouchers.map((voucher) => (
                  <TableRow key={voucher.id}>
                    <TableCell className="font-medium">{voucher.code}</TableCell>
                    <TableCell>{voucher.creditAmount}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          getStatusVariant(voucher.status) === "default"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        {t(`statuses.${voucher.status}`)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {voucher.currentRedemptions} / {voucher.maxRedemptions}
                    </TableCell>
                    <TableCell>{renderAssignedTo(voucher)}</TableCell>
                    <TableCell>{voucher.expiresAt ? new Date(voucher.expiresAt).toLocaleDateString() : "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEditDialog(voucher)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          {t("actions.edit")}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => void handleDeactivate(voucher)}>
                          {voucher.status === "inactive" ? t("actions.activate") : t("actions.deactivate")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(isEditing ? "dialog.editTitle" : "dialog.title")}</DialogTitle>
            <DialogDescription>{t(isEditing ? "dialog.editDescription" : "dialog.description")}</DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.code")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("form.codePlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="creditAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.creditAmount")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        {...field}
                        onChange={(event) => field.onChange(Number(event.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="assignmentScope"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.assignmentScope")}</FormLabel>
                    <Select value={field.value} onValueChange={(value) => field.onChange(value as VoucherAssignmentScope)}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("form.assignmentScopePlaceholder")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="selected">{t("form.assignmentScopes.selected")}</SelectItem>
                        <SelectItem value="all">{t("form.assignmentScopes.all")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {assignmentScope === "selected" ? (
                <FormField
                  control={form.control}
                  name="userIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.users")}</FormLabel>
                      <FormControl>
                        <UserMultiSelect
                          selectedUserIds={field.value ?? []}
                          onSelectionChange={field.onChange}
                          searchUsers={searchUsersForVoucher}
                          initialUsers={editingVoucher?.assignedUsers}
                          placeholder={t("form.usersPlaceholder")}
                          searchPlaceholder={t("form.usersSearchPlaceholder")}
                          loadingMessage={t("form.usersLoading")}
                          emptyMessage={t("form.usersEmpty")}
                          minSearchMessage={t("form.usersMinSearch")}
                          selectionSummary={(count) => t("form.usersSelected", { count })}
                        />
                      </FormControl>
                      <FormDescription>{t("form.usersDescription")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

              <FormField
                control={form.control}
                name="maxRedemptions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.maxRedemptions")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        {...field}
                        value={field.value ?? ""}
                        disabled={assignmentScope === "selected"}
                        onChange={(event) => field.onChange(Number(event.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                    {assignmentScope === "selected" ? (
                      <p className="text-sm text-muted-foreground">
                        {t("form.maxRedemptionsSelectedDescription", { count: selectedUserIds.length })}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t("form.maxRedemptionsAllDescription")}</p>
                    )}
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expiresAt"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>{t("form.expiresAt")}</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !field.value && "text-muted-foreground",
                            )}
                          >
                            {field.value ? format(field.value, "PPP") : <span>{t("form.expiresAtPlaceholder")}</span>}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={field.value ?? undefined}
                          onSelect={(date) => field.onChange(date ?? null)}
                          initialFocus
                          disabled={(date) => date < new Date("1900-01-01")}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>{t("form.expiresAtDescription")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="secret"
                rules={{ required: t("form.secretRequired") }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.secret")}</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder={t("form.secretPlaceholder")} {...field} />
                    </FormControl>
                    <FormDescription>{t("form.secretDescription")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit">{t(isEditing ? "actions.save" : "actions.create")}</Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
