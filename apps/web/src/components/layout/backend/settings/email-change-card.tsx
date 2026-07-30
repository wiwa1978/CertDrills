"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mail, CheckCircle, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Input } from "@/components/ui/input";
import { useSession, changeEmail } from "@/lib/auth-client";
import { authConfig } from "@/config/auth";
import { emailChangeSchema, type EmailChangeFormValues } from "@/schemas";
import { useRouter } from "@/i18n/navigation";

export function EmailChangeCard() {
  const t = useTranslations("settings.emailChange");
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [hasPendingChange, setHasPendingChange] = React.useState(false);

  const form = useForm<EmailChangeFormValues>({
    resolver: zodResolver(emailChangeSchema),
    defaultValues: {
      newEmail: "",
    },
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: EmailChangeFormValues) {
    if (values.newEmail === session?.user?.email) {
      form.setError("newEmail", {
        message: t("sameEmail"),
      });
      return;
    }

    const { error } = await changeEmail({
      newEmail: values.newEmail,
      callbackURL: window.location.href,
    });

    if (error) {
      form.setError("root", {
        message: error.message || t("error"),
      });
    } else {
      toast.success(t("success"));
      setHasPendingChange(true);
      form.reset();
      router.refresh();
    }
  }

  if (!authConfig.allowChangeEmail) {
    return null;
  }

  if (isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            {form.formState.errors.root && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {form.formState.errors.root.message}
              </div>
            )}

            {hasPendingChange && (
              <Alert>
                <Clock className="h-4 w-4" />
                <AlertDescription>{t("pendingVerification")}</AlertDescription>
              </Alert>
            )}

            {/* Current Email */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("currentEmail")}</label>
              <div className="flex items-center gap-2">
                <Input
                  value={session?.user?.email || ""}
                  disabled
                  className="bg-muted"
                />
                {session?.user?.emailVerified && (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                )}
              </div>
            </div>

            <FormField
              control={form.control}
              name="newEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("newEmail")}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder={t("newEmailPlaceholder")}
                      disabled={isSubmitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <p className="text-xs text-muted-foreground">{t("hint")}</p>
          </CardContent>
          <CardFooter className="pt-6">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("sending")}
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
