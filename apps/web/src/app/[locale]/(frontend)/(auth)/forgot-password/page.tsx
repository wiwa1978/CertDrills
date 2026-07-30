"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { forgotPasswordSchema, type ForgotPasswordFormValues } from "@/schemas";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth.forgotPassword");
  const tErrors = useTranslations("auth.errors");
  const router = useRouter();

  // Helper to get translated error message
  const getErrorMessage = (error: { code?: string; message?: string }) => {
    if (error.code) {
      // Try to get translated message for the error code
      const translatedMessage = tErrors(error.code as Parameters<typeof tErrors>[0], { default: "" });
      if (translatedMessage) return translatedMessage;
    }
    return error.message || tErrors("default");
  };

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: ForgotPasswordFormValues) {
    const { error } = await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: "/reset-password",
    });

    if (error) {
      form.setError("root", {
        message: getErrorMessage(error),
      });
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
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("email")}</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder={t("emailPlaceholder")}
                          autoComplete="email"
                          disabled={isSubmitting}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
