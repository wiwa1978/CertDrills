"use client";

import * as React from "react";
import {
  Loader2,
  Shield,
  ShieldCheck,
  ShieldOff,
  QrCode,
  Download,
  RefreshCw,
  Check,
  Copy,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import QRCode from "qrcode";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Separator } from "@/components/ui/separator";
import { useSession, twoFactor } from "@/lib/auth-client";
import { authConfig } from "@/config/auth";
import { useRouter } from "@/i18n/navigation";

type DialogMode = "setup" | "verify" | "backupCodes" | "disable" | null;

export function TwoFactorCard() {
  const t = useTranslations("settings.twoFactor");
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [dialogMode, setDialogMode] = React.useState<DialogMode>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [totpUri, setTotpUri] = React.useState<string>("");
  const [qrCodeDataUrl, setQrCodeDataUrl] = React.useState<string>("");
  const [secret, setSecret] = React.useState<string>("");
  const [verificationCode, setVerificationCode] = React.useState("");
  const [backupCodes, setBackupCodes] = React.useState<string[]>([]);
  const [password, setPassword] = React.useState("");
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);

  const isTwoFactorEnabled = session?.user?.twoFactorEnabled;

  // Generate QR code from TOTP URI
  React.useEffect(() => {
    if (totpUri) {
      QRCode.toDataURL(totpUri, { width: 200, margin: 2 })
        .then(setQrCodeDataUrl)
        .catch(console.error);
    }
  }, [totpUri]);

  const handleEnableTwoFactor = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await twoFactor.enable({
        password,
      });

      if (error) {
        toast.error(error.message || t("enableError"));
        return;
      }

      if (data) {
        setTotpUri(data.totpURI);
        setSecret(data.totpURI.match(/secret=([^&]+)/)?.[1] || "");
        setBackupCodes(data.backupCodes);
        setDialogMode("verify");
      }
    } finally {
      setIsLoading(false);
      setPassword("");
    }
  };

  const handleVerifyCode = async () => {
    setIsLoading(true);
    try {
      const { error } = await twoFactor.verifyTotp({
        code: verificationCode,
      });

      if (error) {
        toast.error(error.message || t("verifyError"));
        return;
      }

      toast.success(t("enableSuccess"));
      setDialogMode("backupCodes");
      router.refresh();
    } finally {
      setIsLoading(false);
      setVerificationCode("");
    }
  };

  const handleDisableTwoFactor = async () => {
    setIsLoading(true);
    try {
      const { error } = await twoFactor.disable({
        password,
      });

      if (error) {
        toast.error(error.message || t("disableError"));
        return;
      }

      toast.success(t("disableSuccess"));
      setDialogMode(null);
      resetState();
      router.refresh();
    } finally {
      setIsLoading(false);
      setPassword("");
    }
  };

  const handleRegenerateBackupCodes = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await twoFactor.generateBackupCodes({
        password,
      });

      if (error) {
        toast.error(error.message || t("regenerateError"));
        return;
      }

      if (data) {
        setBackupCodes(data.backupCodes);
        setDialogMode("backupCodes");
        toast.success(t("regenerateSuccess"));
        router.refresh();
      }
    } finally {
      setIsLoading(false);
      setPassword("");
    }
  };

  const handleViewBackupCodes = async () => {
    setDialogMode("backupCodes");
    // Note: We need to regenerate to view backup codes (they're hashed in DB)
    // So we prompt for password and regenerate
    setBackupCodes([]);
  };

  const downloadBackupCodes = () => {
    const content = [
      `${authConfig.twoFactorIssuer} - Backup Codes`,
      `Generated: ${new Date().toISOString()}`,
      "",
      "Keep these codes safe. Each code can only be used once.",
      "",
      ...backupCodes.map((code, i) => `${i + 1}. ${code}`),
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${authConfig.twoFactorIssuer.toLowerCase().replace(/\s/g, "-")}-backup-codes.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(t("backupCodesDownloaded"));
  };

  const copyBackupCode = async (code: string, index: number) => {
    await navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const resetState = () => {
    setTotpUri("");
    setQrCodeDataUrl("");
    setSecret("");
    setVerificationCode("");
    setBackupCodes([]);
    setPassword("");
  };

  if (!authConfig.enableTwoFactor) {
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
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {isTwoFactorEnabled ? (
            <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
              <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertTitle className="text-green-800 dark:text-green-200">
                {t("enabled")}
              </AlertTitle>
              <AlertDescription className="text-green-700 dark:text-green-300">
                {t("enabledDescription")}
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <ShieldOff className="h-4 w-4" />
              <AlertTitle>{t("disabled")}</AlertTitle>
              <AlertDescription>{t("disabledDescription")}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          {isTwoFactorEnabled ? (
            <>
              {authConfig.allowBackupCodeRegeneration && (
                <Button
                  variant="outline"
                  onClick={handleViewBackupCodes}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t("regenerateBackupCodes")}
                </Button>
              )}
              <Button
                variant="destructive"
                onClick={() => setDialogMode("disable")}
              >
                <ShieldOff className="mr-2 h-4 w-4" />
                {t("disableButton")}
              </Button>
            </>
          ) : (
            <Button onClick={() => setDialogMode("setup")}>
              <Shield className="mr-2 h-4 w-4" />
              {t("enableButton")}
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* Setup Dialog - Enter Password */}
      <Dialog
        open={dialogMode === "setup"}
        onOpenChange={(open) => {
          if (!open) {
            setDialogMode(null);
            resetState();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("setupTitle")}</DialogTitle>
            <DialogDescription>{t("setupDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="setup-password">{t("enterPassword")}</Label>
              <Input
                id="setup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("passwordPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogMode(null);
                resetState();
              }}
            >
              {t("cancel")}
            </Button>
            <Button onClick={handleEnableTwoFactor} disabled={isLoading || !password}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {t("continue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verify Dialog - Scan QR Code */}
      <Dialog
        open={dialogMode === "verify"}
        onOpenChange={(open) => {
          if (!open) {
            setDialogMode(null);
            resetState();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              {t("scanQrCode")}
            </DialogTitle>
            <DialogDescription>{t("scanDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* QR Code */}
            <div className="flex justify-center">
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="TOTP QR Code"
                  className="rounded-lg border"
                />
              ) : (
                <div className="flex h-[200px] w-[200px] items-center justify-center rounded-lg border">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Manual Entry */}
            <div className="space-y-2">
              <Label>{t("manualEntry")}</Label>
              <div className="flex items-center gap-2">
                <Input value={secret} readOnly className="font-mono text-sm" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(secret);
                    toast.success(t("secretCopied"));
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Separator />

            {/* Verification Code */}
            <div className="space-y-2">
              <Label htmlFor="verify-code">{t("verificationCode")}</Label>
              <Input
                id="verify-code"
                type="text"
                value={verificationCode}
                onChange={(e) =>
                  setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                className="font-mono text-center text-lg tracking-widest"
                maxLength={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogMode(null);
                resetState();
              }}
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleVerifyCode}
              disabled={isLoading || verificationCode.length !== 6}
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {t("verify")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Backup Codes Dialog */}
      <Dialog
        open={dialogMode === "backupCodes"}
        onOpenChange={(open) => {
          if (!open) {
            setDialogMode(null);
            resetState();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("backupCodesTitle")}</DialogTitle>
            <DialogDescription>{t("backupCodesDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {backupCodes.length > 0 ? (
              <>
                <Alert>
                  <AlertDescription>{t("backupCodesWarning")}</AlertDescription>
                </Alert>
                <div className="grid grid-cols-2 gap-2">
                  {backupCodes.map((code, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2 font-mono text-sm"
                    >
                      <span>{code}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyBackupCode(code, index)}
                      >
                        {copiedIndex === index ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t("regeneratePrompt")}
                </p>
                <div className="space-y-2">
                  <Label htmlFor="regenerate-password">{t("enterPassword")}</Label>
                  <Input
                    id="regenerate-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("passwordPlaceholder")}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleRegenerateBackupCodes}
                  disabled={isLoading || !password}
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  {t("regenerateBackupCodes")}
                </Button>
              </div>
            )}
          </div>
          {backupCodes.length > 0 && (
            <DialogFooter>
              <Button variant="outline" onClick={downloadBackupCodes}>
                <Download className="mr-2 h-4 w-4" />
                {t("downloadBackupCodes")}
              </Button>
              <Button onClick={() => setDialogMode(null)}>{t("done")}</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Disable Dialog */}
      <Dialog
        open={dialogMode === "disable"}
        onOpenChange={(open) => {
          if (!open) {
            setDialogMode(null);
            resetState();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              {t("disableTitle")}
            </DialogTitle>
            <DialogDescription>{t("disableDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Alert variant="destructive">
              <AlertDescription>{t("disableWarning")}</AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label htmlFor="disable-password">{t("enterPassword")}</Label>
              <Input
                id="disable-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("passwordPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogMode(null);
                resetState();
              }}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisableTwoFactor}
              disabled={isLoading || !password}
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {t("disableConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
