"use client";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { PasswordInput } from "@/components/ui/password-input";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient, twoFactor } from "@/lib/auth-client";
import { authConfig } from "@/config/auth";
import { signInSchema } from "@/schemas";
import { getAdminStatus } from "@/lib/services/admin";

const DEFAULT_REDIRECT = "/admin/overview";

const adminLoginSchema = signInSchema.extend({
  totpCode: z.string().regex(/^\d{6}$/, "Enter a valid 6-digit authentication code").optional().or(z.literal("")),
});

type AdminLoginInput = z.infer<typeof adminLoginSchema>;
type AdminLoginStep = "credentials" | "verify-totp";

async function enforceAdminAccess() {
  try {
    await getAdminStatus();
    return { allowed: true };
  } catch {
    return { allowed: false };
  }
}

function LoginPageContent() {
  const t = useTranslations("auth.login");
  const tErrors = useTranslations("auth.errors");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loginStep, setLoginStep] = React.useState<AdminLoginStep>("credentials");

  const callbackUrl = searchParams.get("callbackUrl");
  const redirectTo = callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : DEFAULT_REDIRECT;

  const getErrorMessage = (error: { code?: string; message?: string }) => {
    if (error.code) {
      try {
        const translatedMessage = tErrors(error.code as Parameters<typeof tErrors>[0], { default: "" });
        if (translatedMessage) return translatedMessage;
      } catch {
        // fall through
      }
    }
    return error.message || tErrors("default");
  };

  const passwordForm = useForm<AdminLoginInput>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
      totpCode: "",
    },
  });

  const isSubmitting = passwordForm.formState.isSubmitting;
  const isTotpStep = loginStep === "verify-totp";

  async function completeAdminLogin() {
    try {
      await getAdminStatus();
    } catch {
      passwordForm.setError("root", {
        message: "This account is not allowed to access the admin portal.",
      });
      return;
    }

    window.location.assign(redirectTo);
  }

  async function onCredentialsSubmit(values: AdminLoginInput) {
    const { data, error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
      ...(authConfig.rememberMeEnabled && { rememberMe: values.rememberMe }),
    });

    if (error) {
      passwordForm.setError("root", { message: getErrorMessage(error) });
      passwordForm.resetField("password");
      return;
    }

    const signInNeedsTotp = Boolean((data as { twoFactorRedirect?: boolean } | null | undefined)?.twoFactorRedirect);
    if (signInNeedsTotp) {
      if (values.totpCode) {
        const verify = await twoFactor.verifyTotp({ code: values.totpCode });
        if (verify.error) {
          passwordForm.setError("totpCode", {
            message: "Enter a valid 6-digit authentication code",
          });
          return;
        }

        const status = await enforceAdminAccess();
        if (!status.allowed) {
          await authClient.signOut();
          passwordForm.setError("root", {
            message: "This account is not allowed to access the admin portal.",
          });
          return;
        }

        await completeAdminLogin();
        return;
      }

      setLoginStep("verify-totp");
      passwordForm.clearErrors();
      passwordForm.resetField("totpCode");
      return;
    }

    const status = await enforceAdminAccess();
    if (!status.allowed) {
      await authClient.signOut();
      passwordForm.setError("root", {
        message: "This account is not allowed to access the admin portal.",
      });
      return;
    }

    await completeAdminLogin();
  }

  async function onTotpSubmit(values: AdminLoginInput) {
    if (!values.totpCode) {
      passwordForm.setError("totpCode", {
        message: "Enter a valid 6-digit authentication code",
      });
      return;
    }

    const verify = await twoFactor.verifyTotp({ code: values.totpCode });
    if (verify.error) {
      passwordForm.setError("totpCode", {
        message: "Enter a valid 6-digit authentication code",
      });
      return;
    }

    const status = await enforceAdminAccess();
    if (!status.allowed) {
      await authClient.signOut();
      passwordForm.setError("root", {
        message: "This account is not allowed to access the admin portal.",
      });
      return;
    }

    await completeAdminLogin();
  }

  function onPasswordSubmit(values: AdminLoginInput) {
    return isTotpStep ? onTotpSubmit(values) : onCredentialsSubmit(values);
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center py-12">
      <Container className="max-w-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="mt-8">
          <Form {...passwordForm}>
            <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
              <div className="rounded-lg border bg-card p-6 space-y-4">
                {passwordForm.formState.errors.root && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {passwordForm.formState.errors.root.message}
                  </div>
                )}

                {loginStep === "verify-totp" && (
                  <div className="rounded-lg border bg-muted/40 p-4 text-sm text-foreground shadow-sm">
                    <div className="mb-2 font-semibold">Authenticator verification</div>
                    <p className="text-muted-foreground">
                      Enter the 6-digit code from your authenticator app to finish signing in.
                    </p>
                  </div>
                )}

                {loginStep === "credentials" && (
                  <>
                    <FormField
                      control={passwordForm.control}
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

                    <FormField
                      control={passwordForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("password")}</FormLabel>
                          <FormControl>
                            <PasswordInput
                              placeholder={t("passwordPlaceholder")}
                              autoComplete="current-password"
                              disabled={isSubmitting}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {authConfig.rememberMeEnabled && (
                      <FormField
                        control={passwordForm.control}
                        name="rememberMe"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={isSubmitting}
                              />
                            </FormControl>
                            <FormLabel className="font-normal cursor-pointer">{t("rememberMe")}</FormLabel>
                          </FormItem>
                        )}
                      />
                    )}
                  </>
                )}

                {isTotpStep && (
                  <FormField
                    control={passwordForm.control}
                    name="totpCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("totpCode")}</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={6}
                            placeholder={t("totpCodePlaceholder")}
                            autoComplete="one-time-code"
                            disabled={isSubmitting}
                            {...field}
                            onChange={(e) => field.onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
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
                    isTotpStep ? "Verify and sign in" : t("submit")
                  )}
                </Button>
              </div>
            </form>
          </Form>

          <div className="mt-4 space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              This workspace is restricted to approved admin accounts.
            </p>

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

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
