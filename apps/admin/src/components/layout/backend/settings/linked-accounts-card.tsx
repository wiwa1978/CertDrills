"use client";

import * as React from "react";
import { Loader2, Link as LinkIcon, Unlink } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { linkSocial, unlinkAccount, listAccounts } from "@/lib/auth-client";
import {
  SUPPORTED_OAUTH_PROVIDERS,
  SUPPORTED_OAUTH_PROVIDER_DETAILS,
  type SupportedOAuthProvider,
} from "@/lib/auth-providers";
import { authConfig } from "@/config/auth";
import { useRouter } from "@/i18n/navigation";

interface LinkedAccount {
  id: string;
  accountId: string;
  providerId: string;
}

export function LinkedAccountsCard() {
  const t = useTranslations("settings.linkedAccounts");
  const router = useRouter();
  const [accounts, setAccounts] = React.useState<LinkedAccount[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isProcessing, setIsProcessing] = React.useState<string | null>(null);
  const [unlinkDialog, setUnlinkDialog] = React.useState<LinkedAccount | null>(
    null
  );

  // Fetch linked accounts
  const fetchAccounts = React.useCallback(async () => {
    try {
      const { data, error } = await listAccounts();
      if (error) {
        console.error("Failed to fetch accounts:", error);
        return;
      }
      // Filter to only OAuth accounts (exclude credential)
      const oauthAccounts = (data || []).filter(
        (acc: LinkedAccount) => acc.providerId !== "credential"
      );
      setAccounts(oauthAccounts);
    } catch {
      console.error("Error fetching accounts");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (authConfig.allowAccountLinking) {
      fetchAccounts();
    } else {
      setIsLoading(false);
    }
  }, [fetchAccounts]);

  const handleLinkAccount = async (provider: SupportedOAuthProvider) => {
    setIsProcessing(provider);
    try {
      await linkSocial({
        provider,
        callbackURL: window.location.href,
      });
    } catch {
      toast.error(t("linkError"));
    } finally {
      setIsProcessing(null);
    }
  };

  const handleUnlinkAccount = async () => {
    if (!unlinkDialog) return;

    setIsProcessing(unlinkDialog.providerId);
    try {
      const { error } = await unlinkAccount({
        providerId: unlinkDialog.providerId,
      });

      if (error) {
        toast.error(error.message || t("unlinkError"));
        return;
      }

      toast.success(t("unlinkSuccess"));
      setUnlinkDialog(null);
      fetchAccounts();
      router.refresh();
    } catch {
      toast.error(t("unlinkError"));
    } finally {
      setIsProcessing(null);
    }
  };

  const isProviderLinked = (provider: SupportedOAuthProvider) =>
    accounts.some((acc) => acc.providerId === provider);

  const getLinkedAccount = (provider: SupportedOAuthProvider) =>
    accounts.find((acc) => acc.providerId === provider);

  if (!authConfig.allowAccountLinking) {
    return null;
  }

  if (isLoading) {
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
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {SUPPORTED_OAUTH_PROVIDERS.map((provider) => {
            const details = SUPPORTED_OAUTH_PROVIDER_DETAILS[provider];
            const Icon = details.Icon;
            const isLinked = isProviderLinked(provider);
            const linkedAccount = getLinkedAccount(provider);

            return (
              <div
                key={provider}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{details.name}</p>
                      {isLinked && (
                        <Badge variant="secondary" className="text-xs">
                          {t("connected")}
                        </Badge>
                      )}
                    </div>
                    {isLinked && linkedAccount && (
                      <p className="text-xs text-muted-foreground">
                        {linkedAccount.accountId}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant={isLinked ? "outline" : "default"}
                  size="sm"
                  onClick={() =>
                    isLinked && linkedAccount
                      ? setUnlinkDialog(linkedAccount)
                      : handleLinkAccount(provider)
                  }
                  disabled={isProcessing === provider}
                >
                  {isProcessing === provider ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isLinked ? (
                    <>
                      <Unlink className="mr-2 h-4 w-4" />
                      {t("unlink")}
                    </>
                  ) : (
                    <>
                      <LinkIcon className="mr-2 h-4 w-4" />
                      {t("link")}
                    </>
                  )}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Unlink Dialog */}
      <Dialog open={!!unlinkDialog} onOpenChange={(open) => !open && setUnlinkDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("unlinkTitle")}</DialogTitle>
            <DialogDescription>
              {t("unlinkDescription", {
                provider:
                  (unlinkDialog?.providerId &&
                    SUPPORTED_OAUTH_PROVIDER_DETAILS[
                      unlinkDialog.providerId as SupportedOAuthProvider
                    ]?.name) ||
                  unlinkDialog?.providerId ||
                  "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlinkDialog(null)}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleUnlinkAccount}
              disabled={isProcessing === unlinkDialog?.providerId}
            >
              {isProcessing === unlinkDialog?.providerId ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Unlink className="mr-2 h-4 w-4" />
              )}
              {t("unlinkConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
