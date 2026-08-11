"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mail, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";

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
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { SocialAuthButtons } from "@/components/layout/frontend/social-auth-buttons";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { authConfig } from "@/config/auth";
import { signUpSchema, type SignUpInput, magicLinkSchema, type MagicLinkFormValues } from "@/schemas";

const passwordFormSchema = signUpSchema;

type PasswordFormValues =
  | SignUpInput
  | Omit<SignUpInput, "passwordConfirmation">;

// Determine the default mode based on config
const getDefaultMode = (): "password" | "magicLink" => {
  if (authConfig.magicLinkOnly) return "magicLink";
  return "password";
};

export default function SignupPage() {
  const t = useTranslations("auth.signup");
  const tErrors = useTranslations("auth.errors");
  const tCommon = useTranslations("common");
  const router = useRouter();

  // Signup mode state
  const [mode, setMode] = React.useState<"password" | "magicLink">(getDefaultMode);
  const [magicLinkSent, setMagicLinkSent] = React.useState(false);
  const [sentEmail, setSentEmail] = React.useState("");

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
  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      ...(authConfig.confirmPasswordEnabled && { passwordConfirmation: "" }),
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

  async function onPasswordSubmit(values: PasswordFormValues) {
    try {
      const { error } = await authClient.signUp.email({
        name: values.name,
        email: values.email,
        password: values.password,
        callbackURL: "/dashboard",
      });

      if (error) {
        passwordForm.setError("root", {
          message: getErrorMessage(error),
        });
        passwordForm.resetField("password");
        if (authConfig.confirmPasswordEnabled) {
          passwordForm.resetField("passwordConfirmation" as keyof PasswordFormValues);
        }
      } else {
        router.push("/dashboard");
      }
    } catch (error) {
      console.error("[signup] signUp.email request failed", error);
      passwordForm.setError("root", {
        message: getUnexpectedErrorMessage(error),
      });
    }
  }

  async function onMagicLinkSubmit(values: MagicLinkFormValues) {
    try {
      const { error } = await authClient.signIn.magicLink({
        email: values.email,
        callbackURL: "/dashboard",
      });

      if (error) {
        magicLinkForm.setError("root", {
          message: getErrorMessage(error),
        });
      } else {
        setSentEmail(values.email);
        setMagicLinkSent(true);
      }
    } catch (error) {
      console.error("[signup] signIn.magicLink request failed", error);
      magicLinkForm.setError("root", {
        message: getUnexpectedErrorMessage(error),
      });
    }
  }

  // Reset magic link state when switching modes
  const switchToPassword = () => {
    setMode("password");
    setMagicLinkSent(false);
    magicLinkForm.reset();
  };

  const switchToMagicLink = () => {
    setMode("magicLink");
    passwordForm.reset();
  };

  // Check if magic link is enabled
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
          {/* Password Signup Form */}
          {mode === "password" && (
            <Form {...passwordForm}>
              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                <div className="rounded-lg border bg-card p-6 space-y-4">
                  {passwordForm.formState.errors.root && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                      {passwordForm.formState.errors.root.message}
                    </div>
                  )}

                  <FormField
                    control={passwordForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("name")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("namePlaceholder")}
                            autoComplete="name"
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
                        <FormLabel>{t("password")}</FormLabel>
                        <FormControl>
                          <PasswordInput
                            placeholder="••••••••"
                            autoComplete="new-password"
                            enableToggle
                            disabled={isPasswordSubmitting}
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
                      control={passwordForm.control}
                      name={"passwordConfirmation" as keyof PasswordFormValues}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("confirmPassword")}</FormLabel>
                          <FormControl>
                            <PasswordInput
                              placeholder="••••••••"
                              autoComplete="new-password"
                              enableToggle
                              disabled={isPasswordSubmitting}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
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
                            {tCommon("orContinueWith")}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <SocialAuthButtons />
                      </div>
                    </>
                  )}
                </div>
              </form>
            </Form>
          )}

          {/* Magic Link Signup Form */}
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
                            {tCommon("orContinueWith")}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <SocialAuthButtons />
                      </div>
                    </>
                  )}
                </div>
              </form>
            </Form>
          )}

          <div className="mt-4 space-y-4">
            <div className="text-center text-sm">
              <span className="text-muted-foreground">{t("hasAccount")} </span>
              <Link
                href="/login"
                className="font-medium text-primary hover:underline"
              >
                {t("signIn")}
              </Link>
            </div>

            <div className="text-center">
              <Button variant="outline" asChild>
                <Link href="/">{tCommon("backToHome")}</Link>
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
