"use client";

import * as React from "react";
import {
  Loader2,
  Key,
  Plus,
  Trash2,
  Fingerprint,
  ShieldAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { passkey } from "@/lib/auth-client";
import { authConfig } from "@/config/auth";
import { useRouter } from "@/i18n/navigation";

export interface Passkey {
  id: string;
  name?: string | null | undefined;
  createdAt?: string | null;
}

export function PasskeysCard() {
  const t = useTranslations("settings.passkeys");
  const router = useRouter();
  const [passkeys, setPasskeys] = React.useState<Passkey[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [selectedPasskey, setSelectedPasskey] = React.useState<Passkey | null>(
    null
  );
  const [newPasskeyName, setNewPasskeyName] = React.useState("");
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [isSupported, setIsSupported] = React.useState(true);

  // Check WebAuthn support
  React.useEffect(() => {
    if (
      typeof window !== "undefined" &&
      (!window.PublicKeyCredential ||
        !PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable)
    ) {
      setIsSupported(false);
    } else {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(
        (available) => {
          setIsSupported(available);
        }
      );
    }
  }, []);

  // Fetch passkeys
  const fetchPasskeys = React.useCallback(async () => {
    try {
      const { data, error } = await passkey.listUserPasskeys();
      if (error) {
        console.error("Failed to fetch passkeys:", error);
        return;
      }
      setPasskeys((data || []) as unknown as Passkey[]);
    } catch {
      console.error("Error fetching passkeys");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (authConfig.enablePasskeys) {
      fetchPasskeys();
    } else {
      setIsLoading(false);
    }
  }, [fetchPasskeys]);

  const handleAddPasskey = async () => {
    setIsProcessing(true);
    try {
      const { error } = await passkey.addPasskey({
        name: newPasskeyName || undefined,
      });

      if (error) {
        toast.error(error.message || t("addError"));
        return;
      }

      toast.success(t("addSuccess"));
      setIsAddDialogOpen(false);
      setNewPasskeyName("");
      fetchPasskeys();
      router.refresh();
    } catch {
      toast.error(t("addError"));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeletePasskey = async () => {
    if (!selectedPasskey) return;

    setIsProcessing(true);
    try {
      const { error } = await passkey.deletePasskey({
        id: selectedPasskey.id,
      });

      if (error) {
        toast.error(error.message || t("deleteError"));
        return;
      }

      toast.success(t("deleteSuccess"));
      setIsDeleteDialogOpen(false);
      setSelectedPasskey(null);
      fetchPasskeys();
      router.refresh();
    } catch {
      toast.error(t("deleteError"));
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDate = (date: string | null | undefined) => {
    if (!date) return t("unknownDate");
    return new Date(date).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (!authConfig.enablePasskeys) {
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
            <Fingerprint className="h-5 w-5" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isSupported && (
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>{t("notSupported")}</AlertDescription>
            </Alert>
          )}

          {passkeys.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <Key className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                {t("noPasskeys")}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {passkeys.map((pk) => (
                <div
                  key={pk.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Key className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {pk.name || t("unnamedPasskey")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("addedOn", { date: formatDate(pk.createdAt) })}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSelectedPasskey(pk);
                      setIsDeleteDialogOpen(true);
                    }}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button
            onClick={() => setIsAddDialogOpen(true)}
            disabled={!isSupported}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("addPasskey")}
          </Button>
        </CardFooter>
      </Card>

      {/* Add Passkey Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("addTitle")}</DialogTitle>
            <DialogDescription>{t("addDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="passkey-name">{t("passkeyName")}</Label>
              <Input
                id="passkey-name"
                value={newPasskeyName}
                onChange={(e) => setNewPasskeyName(e.target.value)}
                placeholder={t("passkeyNamePlaceholder")}
              />
              <p className="text-xs text-muted-foreground">
                {t("passkeyNameHint")}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddDialogOpen(false);
                setNewPasskeyName("");
              }}
            >
              {t("cancel")}
            </Button>
            <Button onClick={handleAddPasskey} disabled={isProcessing}>
              {isProcessing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Fingerprint className="mr-2 h-4 w-4" />
              )}
              {t("register")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Passkey Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              {t("deleteTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("deleteDescription", {
                name: selectedPasskey?.name || t("unnamedPasskey"),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setSelectedPasskey(null);
              }}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeletePasskey}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {t("deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
