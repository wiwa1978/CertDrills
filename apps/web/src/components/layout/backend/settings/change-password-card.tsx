"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useRouter } from "@/i18n/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { authClient } from "@/lib/auth-client";
import { authConfig } from "@/config/auth";
import { getPasswordSchema } from "@/schemas/auth";

// Build form schema based on config
const baseSchema = {
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: getPasswordSchema(),
};

const formSchema = authConfig.confirmPasswordEnabled
  ? z
      .object({
        ...baseSchema,
        confirmPassword: z.string().min(1, "Please confirm your password"),
      })
      .refine((data) => data.newPassword === data.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
      })
      .refine((data) => data.currentPassword !== data.newPassword, {
        message: "New password must be different from current password",
        path: ["newPassword"],
      })
  : z
      .object(baseSchema)
      .refine((data) => data.currentPassword !== data.newPassword, {
        message: "New password must be different from current password",
        path: ["newPassword"],
      });

type FormValues = z.infer<typeof formSchema>;

export function ChangePasswordCard() {
  const t = useTranslations("settings.changePassword");
  const router = useRouter();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      ...(authConfig.confirmPasswordEnabled && { confirmPassword: "" }),
    },
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: FormValues) {
    const { error } = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: true,
    });

    if (error) {
      form.setError("root", {
        message: error.message || t("error"),
      });
    } else {
      toast.success(t("success"));
      form.reset();
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            {form.formState.errors.root && (
              <div className="rounded-md bg-primary/10 p-3 text-sm text-primary">
                {form.formState.errors.root.message}
              </div>
            )}

            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("currentPassword")}</FormLabel>
                  <FormControl>
                    <PasswordInput
                      placeholder={t("currentPasswordPlaceholder")}
                      autoComplete="current-password"
                      disabled={isSubmitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("newPassword")}</FormLabel>
                  <FormControl>
                    <PasswordInput
                      placeholder={t("newPasswordPlaceholder")}
                      autoComplete="new-password"
                      enableToggle
                      disabled={isSubmitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {authConfig.confirmPasswordEnabled && (
              <FormField
                control={form.control}
                name={"confirmPassword" as keyof FormValues}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("confirmPassword")}</FormLabel>
                    <FormControl>
                      <PasswordInput
                        placeholder={t("confirmPasswordPlaceholder")}
                        autoComplete="new-password"
                        enableToggle
                        disabled={isSubmitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </CardContent>
          <CardFooter className="pt-6">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("submitting")}
                </>
              ) : (
                t("submit")
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
