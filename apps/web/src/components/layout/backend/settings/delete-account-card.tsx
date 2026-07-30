"use client";

import * as React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

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
import { deleteUser } from "@/lib/auth-client";
import { authConfig } from "@/config/auth";

function generateConfirmationCode(): string {
  return Math.random().toString().slice(2, 10);
}

export function DeleteAccountCard() {
  const t = useTranslations("settings.deleteAccount");
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [countdown, setCountdown] = React.useState<number | null>(null);
  const [confirmationCode, setConfirmationCode] = React.useState("");
  const [inputValue, setInputValue] = React.useState("");
  const [isDeleting, setIsDeleting] = React.useState(false);

  const isCodeValid = inputValue === confirmationCode;
  const isCountdownActive = countdown !== null && countdown > 0;
  const isCountdownComplete = countdown === 0;

  // Reset state when dialog opens
  React.useEffect(() => {
    if (isDialogOpen) {
      setCountdown(null);
      setConfirmationCode(generateConfirmationCode());
      setInputValue("");
    }
  }, [isDialogOpen]);

  // Start countdown when code becomes valid
  React.useEffect(() => {
    if (isCodeValid && countdown === null) {
      setCountdown(authConfig.deleteAccountCountdownSeconds);
    }
  }, [isCodeValid, countdown]);

  // Countdown timer (only when countdown is active)
  React.useEffect(() => {
    if (countdown === null || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  const handleDelete = async () => {
    if (!isCodeValid) return;

    setIsDeleting(true);

    const { error } = await deleteUser({
      callbackURL: "/",
    });

    if (error) {
      toast.error(error.message || t("error"));
      setIsDeleting(false);
    } else {
      toast.success(t("success"));
    }
  };

  return (
    <>
      <Card className="border-primary/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-primary" />
            <CardTitle className="text-primary">{t("title")}</CardTitle>
          </div>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button
            variant="default"
            onClick={() => setIsDialogOpen(true)}
            className="w-full sm:w-auto"
          >
            {t("button")}
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {t("dialogTitle")}
            </DialogTitle>
            <DialogDescription>{t("dialogDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-md bg-primary/10 p-4 text-sm text-primary/70">
              {t("warning")}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmation-code">
                {t("confirmationLabel", { code: confirmationCode })}
              </Label>
              <Input
                id="confirmation-code"
                type="text"
                placeholder={t("confirmationPlaceholder")}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                disabled={isDeleting}
                className="font-mono"
              />
            </div>
          </div>

          <DialogFooter>
            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isDeleting}
              >
                {t("cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={!isCountdownComplete || isDeleting}
                className={
                  !isCountdownComplete
                    ? "bg-destructive/50 hover:bg-destructive/50"
                    : ""
                }
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("deleting")}
                  </>
                ) : isCountdownActive ? (
                  t("buttonCountdown", { seconds: countdown })
                ) : (
                  t("confirmButton")
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
