"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { Link, useRouter } from "@/i18n/navigation";
import { useIsHydrated } from "@/hooks/use-hydrated";
import { authClient } from "@/lib/auth-client";
import { authConfig } from "@/config/auth";
import { getPasswordSchema } from "@/schemas/auth";

// Build form schema based on config
const baseSchema = {
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
  : z.object(baseSchema);

type FormValues = z.infer<typeof formSchema>;

export default function ResetPasswordPage() {
  const t = useTranslations("auth.resetPassword");
  const tErrors = useTranslations("auth.errors");
  const router = useRouter();
  const isHydrated = useIsHydrated();
  const tokenChecked = useRef(false);

  // Helper to get translated error message
  const getErrorMessage = (error: { code?: string; message?: string }) => {
    if (error.code) {
      // Try to get translated message for the error code
      const translatedMessage = tErrors(error.code as Parameters<typeof tErrors>[0], { default: "" });
      if (translatedMessage) return translatedMessage;
    }
    return error.message || tErrors("default");
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      newPassword: "",
      ...(authConfig.confirmPasswordEnabled && { confirmPassword: "" }),
    },
  });

  const { isSubmitting } = form.formState;

  // Validate token on mount
  useEffect(() => {
    if (tokenChecked.current || !isHydrated) return;
    tokenChecked.current = true;

    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get("token");

    if (!token || token === "INVALID_TOKEN") {
      toast.error(t("invalidToken"));
      router.push("/login");
    }
  }, [isHydrated, router, t]);

  async function onSubmit(values: FormValues) {
    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get("token");

    if (!token) {
      form.setError("root", { message: t("invalidToken") });
      return;
    }

    const { error } = await authClient.resetPassword({
      newPassword: values.newPassword,
      token,
    });

    if (error) {
      form.setError("root", {
        message: getErrorMessage(error),
      });
      form.reset();
    } else {
      toast.success(t("success"));
      router.push("/login");
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center py-12">
      <Container className="max-w-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="mt-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="rounded-lg border bg-card p-6 space-y-4">
                {form.formState.errors.root && (
                  <div className="rounded-md bg-primary/10 p-3 text-sm text-primary">
                    {form.formState.errors.root.message}
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("newPassword")}</FormLabel>
                      <FormControl>
                        <PasswordInput
                          placeholder="••••••••"
                          autoComplete="new-password"
                          enableToggle
                          disabled={isSubmitting}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>{t("passwordHint")}</FormDescription>
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
                            placeholder="••••••••"
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

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("submitting")}
                    </>
                  ) : (
                    t("submit")
                  )}
                </Button>
              </div>
            </form>
          </Form>

          <div className="mt-4 space-y-4">
            <div className="text-center text-sm">
              <span className="text-muted-foreground">{t("rememberPassword")} </span>
              <Link
                href="/login"
                className="font-medium text-primary hover:underline"
              >
                {t("backToLogin")}
              </Link>
            </div>

            <div className="text-center">
              <Button variant="outline" asChild>
                <Link href="/">{t("backHome")}</Link>
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
