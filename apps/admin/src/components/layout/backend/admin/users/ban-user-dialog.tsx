"use client";

import * as React from "react";
import { Ban, CalendarIcon, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { format } from "date-fns";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { banAdminUser, verifyAdminSecret } from "@/lib/services/admin";

const banUserSchema = z.object({
  reason: z.string().optional(),
  banExpires: z.date().optional(),
  secretKey: z.string().min(1, "Secret key is required"),
});

type BanUserInput = z.infer<typeof banUserSchema>;

interface BanUserDialogProps {
  userId: string;
  userName: string;
  onSuccess?: () => void;
}

export function BanUserDialog({
  userId,
  userName,
  onSuccess,
}: BanUserDialogProps) {
  const t = useTranslations("admin.users.banDialog");
  const tSuccess = useTranslations("admin.success");
  const tErrors = useTranslations("admin.errors");
  const [open, setOpen] = React.useState(false);
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const [isVerifyingSecret, startVerify] = React.useTransition();
  const [isSecretValid, setIsSecretValid] = React.useState(false);
  const [secretError, setSecretError] = React.useState<string | null>(null);

  const form = useForm<BanUserInput>({
    resolver: zodResolver(banUserSchema),
    defaultValues: {
      reason: "",
      banExpires: undefined,
      secretKey: "",
    },
  });

  const secretValue = form.watch("secretKey");

  React.useEffect(() => {
    if (!secretValue) {
      setIsSecretValid(false);
      setSecretError(null);
      return;
    }

    setSecretError(null);
    const debounce = setTimeout(() => {
      startVerify(async () => {
        const result = await verifyAdminSecret(secretValue);
        if (result.success) {
          setIsSecretValid(true);
          setSecretError(null);
        } else {
          setIsSecretValid(false);
          setSecretError(result.error ?? tErrors("invalidBanSecret"));
        }
      });
    }, 300);

    return () => clearTimeout(debounce);
  }, [secretValue, tErrors]);

  const onSubmit = async (values: BanUserInput) => {
    if (!isSecretValid) {
      toast.error(tErrors("invalidBanSecret"));
      return;
    }
    // Combine date and time if both are provided
    let banExpiresDate: Date | undefined = values.banExpires;
    if (banExpiresDate) {
      const timeInput = (document.getElementById('ban-time') as HTMLInputElement)?.value;
      if (timeInput) {
        const [hours, minutes] = timeInput.split(':');
        banExpiresDate = new Date(banExpiresDate);
        banExpiresDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      }
    }

    const banExpiresIn = banExpiresDate
      ? Math.max(1, Math.floor((banExpiresDate.getTime() - Date.now()) / 1000))
      : undefined;

    const result = await banAdminUser({
      userId,
      secret: values.secretKey,
      ...(values.reason && { banReason: values.reason }),
      ...(banExpiresIn && { banExpiresIn }),
    });

    if ((result as { error?: unknown }).error) {
      toast.error(tErrors("banFailed"));
    } else {
      toast.success(tSuccess("userBanned"));
      setOpen(false);
      form.reset();
      setIsSecretValid(false);
      setSecretError(null);
      onSuccess?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
          <Ban className="mr-2 h-4 w-4" />
          <span>{t("trigger")}</span>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description", { name: userName })}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("reasonLabel")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("reasonPlaceholder")}
                      {...field}
                      rows={4}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="banExpires"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>{t("expiryLabel")}</FormLabel>
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
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
                            <span>{t("expiryPlaceholder")}</span>
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
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.watch("banExpires") && (
              <div className="space-y-2">
                <FormLabel htmlFor="ban-time">{t("timeLabel")}</FormLabel>
                <Input
                  id="ban-time"
                  type="time"
                  defaultValue="23:59"
                  className="w-full"
                />
              </div>
            )}
            <FormField
              control={form.control}
              name="secretKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    {t("secretLabel")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={t("secretPlaceholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>{t("secretHint")}</FormDescription>
                  <FormMessage>
                    {secretError && !isVerifyingSecret ? secretError : null}
                  </FormMessage>
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={
                  form.formState.isSubmitting ||
                  !isSecretValid ||
                  isVerifyingSecret
                }
              >
                {form.formState.isSubmitting ? t("banning") : t("banUser")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
