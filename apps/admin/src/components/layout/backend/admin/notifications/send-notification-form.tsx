"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Send, CalendarIcon } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { UserMultiSelect } from "@/components/layout/backend/admin/billing/user-multi-select";
import {
  searchUsersForNotification,
  sendNotificationToAllUsers,
  sendNotificationToUsers,
} from "@/lib/services/notifications";
import {
  sendNotificationSchema,
} from "@/schemas/notification";

const sendNotificationFormSchema = sendNotificationSchema.extend({
  secret: z.string().trim().min(1, "Admin secret is required"),
});

type SendNotificationFormInput = z.infer<typeof sendNotificationFormSchema>;

export function SendNotificationForm() {
  const t = useTranslations("admin.notifications.sendToAll");
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const [recipientMode, setRecipientMode] = React.useState<"all" | "selected">("all");
  const [selectedUserIds, setSelectedUserIds] = React.useState<string[]>([]);

  const form = useForm<SendNotificationFormInput>({
    resolver: zodResolver(sendNotificationFormSchema),
    mode: "onChange",
    defaultValues: {
      titleEn: "",
      messageEn: "",
      titleNl: "",
      messageNl: "",
      titleFr: "",
      messageFr: "",
      type: "info",
      category: "system",
      showAsBanner: false,
      bannerExpiresAt: undefined,
      secret: "",
    },
  });

  async function onSubmit(values: SendNotificationFormInput) {
    setIsSubmitting(true);
    try {
      if (recipientMode === "selected" && selectedUserIds.length === 0) {
        toast.error(t("recipients.emptyError"));
        return;
      }

      // Combine date and time for banner expiry
      let bannerExpiresDate: Date | undefined = values.bannerExpiresAt;
      if (bannerExpiresDate && values.showAsBanner) {
        const timeInput = (
          document.getElementById("banner-time") as HTMLInputElement
        )?.value;
        if (timeInput) {
          const [hours, minutes] = timeInput.split(":");
          bannerExpiresDate = new Date(bannerExpiresDate);
          bannerExpiresDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        }
      }

      const payload = {
        title: values.titleEn, // Fallback to English
        message: values.messageEn,
        type: values.type,
        category: values.category,
        showAsBanner: values.showAsBanner,
        bannerExpiresAt: bannerExpiresDate,
        secret: values.secret.trim(),
        data: {
          translations: {
            en: { title: values.titleEn, message: values.messageEn },
            nl: { title: values.titleNl, message: values.messageNl },
            fr: { title: values.titleFr, message: values.messageFr },
          },
        },
      };

      const result = recipientMode === "selected"
        ? await sendNotificationToUsers({ ...payload, userIds: selectedUserIds })
        : await sendNotificationToAllUsers(payload);

      if (result.success) {
        const successMessage = t("success", { count: result.sentCount || 0 });
        toast.success(result.skippedCount > 0 ? `${successMessage} ${t("skipped", { count: result.skippedCount })}` : successMessage);
        form.reset();
        setSelectedUserIds([]);
        router.refresh();
      } else {
        toast.error(result.error || t("error"));
      }
    } catch (error) {
      toast.error(t("error"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(recipientMode === "selected" ? "sendSelected.title" : "title")}</CardTitle>
        <CardDescription>{t(recipientMode === "selected" ? "sendSelected.description" : "description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-3 rounded-md border p-4">
              <div className="space-y-1">
                <FormLabel>{t("recipients.label")}</FormLabel>
                <FormDescription>{t("recipients.description")}</FormDescription>
              </div>
              <Select value={recipientMode} onValueChange={(value: "all" | "selected") => setRecipientMode(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("recipients.allUsers")}</SelectItem>
                  <SelectItem value="selected">{t("recipients.selectedUsers")}</SelectItem>
                </SelectContent>
              </Select>
              {recipientMode === "selected" && (
                <UserMultiSelect
                  selectedUserIds={selectedUserIds}
                  onSelectionChange={setSelectedUserIds}
                  searchUsers={searchUsersForNotification}
                  disabled={isSubmitting}
                  placeholder={t("recipients.placeholder")}
                  searchPlaceholder={t("recipients.searchPlaceholder")}
                  loadingMessage={t("recipients.loadingMessage")}
                  emptyMessage={t("recipients.emptyMessage")}
                  minSearchMessage={t("recipients.minSearchMessage")}
                  selectionSummary={(count) => t("recipients.summary", { count })}
                />
              )}
            </div>

            <Tabs defaultValue="en" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="en">English</TabsTrigger>
                <TabsTrigger value="nl">Nederlands</TabsTrigger>
                <TabsTrigger value="fr">Français</TabsTrigger>
              </TabsList>

              <TabsContent value="en" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="titleEn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.title")} (EN)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("form.titlePlaceholder")}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="messageEn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.message")} (EN)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t("form.messagePlaceholder")}
                          className="min-h-25"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="nl" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="titleNl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.title")} (NL)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("form.titlePlaceholder")}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="messageNl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.message")} (NL)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t("form.messagePlaceholder")}
                          className="min-h-25"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="fr" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="titleFr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.title")} (FR)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("form.titlePlaceholder")}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="messageFr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.message")} (FR)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t("form.messagePlaceholder")}
                          className="min-h-25"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>
            </Tabs>

            <div className="space-y-6">
              <FormField
                control={form.control}
                name="showAsBanner"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>{t("form.showAsBanner")}</FormLabel>
                      <FormDescription>
                        {t("form.showAsBannerDescription")}
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              {form.watch("showAsBanner") && (
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="bannerExpiresAt"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>{t("form.bannerExpiresAt")}</FormLabel>
                        <Popover
                          open={calendarOpen}
                          onOpenChange={setCalendarOpen}
                        >
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>
                                    {t("form.bannerExpiresAtPlaceholder")}
                                  </span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={(date) => {
                                field.onChange(date);
                                setCalendarOpen(false);
                              }}
                              disabled={(date) =>
                                date < new Date(new Date().setHours(0, 0, 0, 0))
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormDescription>
                          {t("form.bannerExpiresAtDescription")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {form.watch("bannerExpiresAt") && (
                    <div className="space-y-2">
                      <FormLabel htmlFor="banner-time">
                        {t("form.bannerTime")}
                      </FormLabel>
                      <Input
                        id="banner-time"
                        type="time"
                        defaultValue="23:59"
                        className="w-full"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.type")}</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="info">
                          {t("form.types.info")}
                        </SelectItem>
                        <SelectItem value="success">
                          {t("form.types.success")}
                        </SelectItem>
                        <SelectItem value="warning">
                          {t("form.types.warning")}
                        </SelectItem>
                        <SelectItem value="error">
                          {t("form.types.error")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {t("form.typeDescription")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.category")}</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="security">
                          {t("form.categories.security")}
                        </SelectItem>
                        <SelectItem value="account">
                          {t("form.categories.account")}
                        </SelectItem>
                        <SelectItem value="billing">
                          {t("form.categories.billing")}
                        </SelectItem>
                        <SelectItem value="usage">
                          {t("form.categories.usage")}
                        </SelectItem>
                        <SelectItem value="system">
                          {t("form.categories.system")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {t("form.categoryDescription")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="secret"
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

            <Button
              type="submit"
              disabled={isSubmitting || !form.formState.isValid || !form.watch("secret").trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("form.sending")}
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  {t(recipientMode === "selected" ? "form.submitSelected" : "form.submit")}
                </>
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
