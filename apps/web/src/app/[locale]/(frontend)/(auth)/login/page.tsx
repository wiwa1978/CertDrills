"use client";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mail, CheckCircle2 } from "lucide-react";
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
import { SocialAuthButtons } from "@/components/layout/frontend/social-auth-buttons";
import { Link, useRouter } from "@/i18n/navigation";
import { getInternalNavigationPath } from "@/i18n/path-locale";
import { authClient } from "@/lib/auth-client";
import { getPasswordSignInRequest, getWebLoginAccessDecision } from "@/lib/login-submit";
import { authConfig } from "@/config/auth";
import { signInSchema, type SignInInput, magicLinkSchema, type MagicLinkFormValues } from "@/schemas";

const DEFAULT_REDIRECT = "/dashboard";

// Determine the default mode based on config
const getDefaultMode = (): "password" | "magicLink" => {
  if (authConfig.magicLinkOnly) return "magicLink";
  return "password";
};

function LoginPageContent() {
  const t = useTranslations("auth.login");
  const tErrors = useTranslations("auth.errors");
  const tVerification = useTranslations("emailVerification");
  const router = useRouter();
  const searchParams = useSearchParams();

  // Login mode state
  const [mode, setMode] = React.useState<"password" | "magicLink">(getDefaultMode);
  const [magicLinkSent, setMagicLinkSent] = React.useState(false);
  const [sentEmail, setSentEmail] = React.useState("");
  const [passwordErrorCode, setPasswordErrorCode] = React.useState<string | null>(null);
  const [isResendingVerification, setIsResendingVerification] = React.useState(false);
  const [verificationNotice, setVerificationNotice] = React.useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  // Get callbackUrl from query params, with validation
  const callbackUrl = searchParams.get("callbackUrl");
  const redirectTo =
    callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : DEFAULT_REDIRECT;
  const navigationPath = getInternalNavigationPath(redirectTo);

  // Helper to get translated error message
  const getErrorMessage = (error: { code?: string; message?: string }) => {
    if (error.code) {
      try {
        const translatedMessage = tErrors(error.code as Parameters<typeof tErrors>[0], { default: "" });
        if (translatedMessage) return translatedMessage;
      } catch {
        // Fall back to backend message when translation key is missing.
      }
    }
    return error.message || tErrors("default");
  };

  const getUnexpectedErrorMessage = (error: unknown) => {
    if (error instanceof Error && error.message === "Failed to fetch") {
      return tErrors("NETWORK_ERROR");
    }

    if (error instanceof Error && error.message) {
      return error.message;
    }

    return tErrors("default");
  };

  // Password form
  const passwordForm = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
    },
  });

  // Magic link form
  const magicLinkForm = useForm<MagicLinkFormValues>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: {
      email: "",
    },
  });

  const isPasswordSubmitting = passwordForm.formState.isSubmitting;
  const isMagicLinkSubmitting = magicLinkForm.formState.isSubmitting;

  async function onPasswordSubmit(values: SignInInput) {
    try {
      setPasswordErrorCode(null);
      setVerificationNotice(null);

      const { data, error } = await authClient.signIn.email(
        getPasswordSignInRequest(values, authConfig.rememberMeEnabled),
      );

      if (error) {
        setPasswordErrorCode(error.code ?? null);

        if (error.code === "EMAIL_NOT_VERIFIED") {
          passwordForm.clearErrors("root");
          setVerificationNotice({
            type: "info",
            message: getErrorMessage(error),
          });
          passwordForm.resetField("password");
          return;
        }

        passwordForm.setError("root", {
          message: getErrorMessage(error),
        });
        passwordForm.resetField("password");
      } else {
        const accessDecision = getWebLoginAccessDecision(data?.user);

        if (!accessDecision.allowed) {
          await authClient.signOut();
          passwordForm.setError("root", {
            message: tErrors(accessDecision.errorCode),
          });
          passwordForm.resetField("password");
          return;
        }

        router.push(navigationPath);
      }
    } catch (error) {
      setPasswordErrorCode(null);
      console.error("[login] signIn.email request failed", error);
      passwordForm.setError("root", {
        message: getUnexpectedErrorMessage(error),
      });
      passwordForm.resetField("password");
    }
  }

  async function onResendVerificationEmail() {
    const isEmailValid = await passwordForm.trigger("email");

    if (!isEmailValid) {
      return;
    }

    const email = passwordForm.getValues("email").trim();

    setIsResendingVerification(true);
    setVerificationNotice(null);

    try {
      const { error } = await authClient.sendVerificationEmail({
        email,
        callbackURL: redirectTo,
      });

      if (error) {
        setVerificationNotice({
          type: "error",
          message: getErrorMessage(error),
        });
        return;
      }

      setVerificationNotice({
        type: "success",
        message: tVerification("emailSent"),
      });
    } catch (error) {
      console.error("[login] resend verification email failed", error);
      setVerificationNotice({
        type: "error",
        message: getUnexpectedErrorMessage(error),
      });
    } finally {
      setIsResendingVerification(false);
    }
  }

  async function onMagicLinkSubmit(values: MagicLinkFormValues) {
    try {
      const { error } = await authClient.signIn.magicLink({
        email: values.email,
        callbackURL: redirectTo,
      });

      if (error) {
        console.error("[login] signIn.magicLink failed", {
          code: error.code,
          message: error.message,
        });
        magicLinkForm.setError("root", {
          message: getErrorMessage(error),
        });
      } else {
        setSentEmail(values.email);
        setMagicLinkSent(true);
      }
    } catch (error) {
      console.error("[login] signIn.magicLink request failed", error);
      magicLinkForm.setError("root", {
        message: getUnexpectedErrorMessage(error),
      });
    }
  }

  // Reset magic link state when switching modes
  const switchToPassword = () => {
    setMode("password");
    setMagicLinkSent(false);
    setVerificationNotice(null);
    magicLinkForm.reset();
  };

  const switchToMagicLink = () => {
    setMode("magicLink");
    setVerificationNotice(null);
    passwordForm.reset();
  };

  // Check if magic link or social auth is enabled
  const showMagicLinkOption = authConfig.enableMagicLink;
  const showPasswordOption = !authConfig.magicLinkOnly;
  const showSocialAuth = authConfig.enableSocialAuth;

  // Magic link success state
  if (magicLinkSent) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center py-12">
        <Container className="max-w-md">
          <div className="rounded-lg border bg-card p-8 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">{t("magicLinkSent")}</h1>
            <p className="text-muted-foreground">
              {t("magicLinkSentDescription", { email: sentEmail })}
            </p>
            <div className="pt-4 space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setMagicLinkSent(false);
                  magicLinkForm.reset();
                }}
              >
                {t("magicLinkTryAgain")}
              </Button>
              {showPasswordOption && (
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={switchToPassword}
                >
                  {t("usePassword")}
                </Button>
              )}
            </div>
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center py-12">
      <Container className="max-w-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="mt-8">
          {/* Password Login Form */}
          {mode === "password" && (
            <Form {...passwordForm}>
              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                <div className="rounded-lg border bg-card p-6 space-y-4">
                  {passwordForm.formState.errors.root && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                      <p>{passwordForm.formState.errors.root.message}</p>
                    </div>
                  )}

                  {verificationNotice && (
                    <div
                      className={`rounded-md p-3 text-sm ${verificationNotice.type === "success"
                          ? "bg-primary/10 text-primary"
                          : verificationNotice.type === "info"
                            ? "bg-muted text-foreground"
                            : "bg-destructive/10 text-destructive"
                        }`}
                    >
                      <p>{verificationNotice.message}</p>
                      {passwordErrorCode === "EMAIL_NOT_VERIFIED" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          onClick={onResendVerificationEmail}
                          disabled={isPasswordSubmitting || isResendingVerification}
                        >
                          {isResendingVerification ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              {tVerification("sending")}
                            </>
                          ) : (
                            tVerification("resendButton")
                          )}
                        </Button>
                      )}
                    </div>
                  )}

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
                            disabled={isPasswordSubmitting}
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
                        <div className="flex items-center justify-between">
                          <FormLabel>{t("password")}</FormLabel>
                          <Link
                            href="/forgot-password"
                            className="text-sm text-muted-foreground hover:text-primary hover:underline"
                          >
                            {t("forgotPassword")}
                          </Link>
                        </div>
                        <FormControl>
                          <PasswordInput
                            placeholder={t("passwordPlaceholder")}
                            autoComplete="current-password"
                            disabled={isPasswordSubmitting}
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
                              disabled={isPasswordSubmitting}
                            />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer">
                            {t("rememberMe")}
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  )}

                  <Button type="submit" className="w-full" disabled={isPasswordSubmitting}>
                    {isPasswordSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("submitting")}
                      </>
                    ) : (
                      t("submit")
                    )}
                  </Button>

                  {/* Magic Link Toggle */}
                  {showMagicLinkOption && (
                    <>
                      <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-card px-2 text-muted-foreground">
                            {t("orContinue")}
                          </span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={switchToMagicLink}
                      >
                        <Mail className="mr-2 h-4 w-4" />
                        {t("useMagicLink")}
                      </Button>
                    </>
                  )}

                  {showSocialAuth && (
                    <>
                      <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-card px-2 text-muted-foreground">
                            {t("orContinue")}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <SocialAuthButtons callbackUrl={redirectTo} />
                      </div>
                    </>
                  )}
                </div>
              </form>
            </Form>
          )}

          {/* Magic Link Login Form */}
          {mode === "magicLink" && (
            <Form {...magicLinkForm}>
              <form onSubmit={magicLinkForm.handleSubmit(onMagicLinkSubmit)} className="space-y-4">
                <div className="rounded-lg border bg-card p-6 space-y-4">
                  {magicLinkForm.formState.errors.root && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                      {magicLinkForm.formState.errors.root.message}
                    </div>
                  )}

                  <div className="text-center pb-2">
                    <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <Mail className="h-5 w-5 text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t("magicLinkDescription")}
                    </p>
                  </div>

                  <FormField
                    control={magicLinkForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("email")}</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder={t("emailPlaceholder")}
                            autoComplete="email"
                            disabled={isMagicLinkSubmitting}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full" disabled={isMagicLinkSubmitting}>
                    {isMagicLinkSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("magicLinkSubmitting")}
                      </>
                    ) : (
                      <>
                        <Mail className="mr-2 h-4 w-4" />
                        {t("magicLinkSubmit")}
                      </>
                    )}
                  </Button>

                  {/* Password Toggle */}
                  {showPasswordOption && (
                    <>
                      <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-card px-2 text-muted-foreground">
                            {t("orContinue")}
                          </span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={switchToPassword}
                      >
                        {t("usePassword")}
                      </Button>
                    </>
                  )}

                  {showSocialAuth && (
                    <>
                      <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-card px-2 text-muted-foreground">
                            {t("orContinue")}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <SocialAuthButtons callbackUrl={redirectTo} />
                      </div>
                    </>
                  )}
                </div>
              </form>
            </Form>
          )}

          <div className="mt-4 space-y-4">
            <div className="text-center text-sm">
              <span className="text-muted-foreground">{t("noAccount")} </span>
              <Link
                href="/signup"
                className="font-medium text-primary hover:underline"
              >
                {t("signUpLink")}
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

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
