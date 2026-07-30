"use client";

import * as React from "react";
import {
  Loader2,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  Trash2,
  Shield,
  MapPin,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { UAParser } from "ua-parser-js";

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
import { listSessions, revokeSession, revokeSessions, getSession } from "@/lib/auth-client";

export interface Session {
  id: string;
  token: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

interface ParsedSession extends Session {
  deviceName: string;
  browserName: string;
  osName: string;
  isCurrent: boolean;
}

function parseUserAgent(userAgent: string | null | undefined): {
  deviceName: string;
  browserName: string;
  osName: string;
  deviceType: "desktop" | "mobile" | "tablet" | "unknown";
} {
  if (!userAgent) {
    return {
      deviceName: "Unknown Device",
      browserName: "Unknown Browser",
      osName: "Unknown OS",
      deviceType: "unknown",
    };
  }

  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  const browser = result.browser.name || "Unknown Browser";
  const browserVersion = result.browser.major ? ` ${result.browser.major}` : "";
  const os = result.os.name || "Unknown OS";
  const osVersion = result.os.version ? ` ${result.os.version}` : "";
  const device = result.device.model || result.device.vendor || "";

  let deviceType: "desktop" | "mobile" | "tablet" | "unknown" = "unknown";
  if (result.device.type === "mobile") {
    deviceType = "mobile";
  } else if (result.device.type === "tablet") {
    deviceType = "tablet";
  } else if (!result.device.type) {
    // No device type usually means desktop
    deviceType = "desktop";
  }

  const deviceName = device || `${os}${osVersion}`;
  const browserName = `${browser}${browserVersion}`;
  const osName = `${os}${osVersion}`;

  return { deviceName, browserName, osName, deviceType };
}

function getDeviceIcon(deviceType: "desktop" | "mobile" | "tablet" | "unknown") {
  switch (deviceType) {
    case "mobile":
      return Smartphone;
    case "tablet":
      return Tablet;
    case "desktop":
      return Monitor;
    default:
      return Globe;
  }
}

export function ActiveSessionsCard() {
  const t = useTranslations("settings.sessions");
  const [sessions, setSessions] = React.useState<ParsedSession[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRevoking, setIsRevoking] = React.useState<string | null>(null);
  const [isRevokingAll, setIsRevokingAll] = React.useState(false);
  const [revokeDialogSession, setRevokeDialogSession] =
    React.useState<ParsedSession | null>(null);
  const [showRevokeAllDialog, setShowRevokeAllDialog] = React.useState(false);

  // Fetch sessions
  const fetchSessions = React.useCallback(async () => {
    try {
      const [sessionsResult, currentSession] = await Promise.all([
        listSessions(),
        getSession(),
      ]);

      if (sessionsResult.error) {
        console.error("Failed to fetch sessions:", sessionsResult.error);
        return;
      }

      const currentToken = currentSession.data?.session?.token;

      const parsed: ParsedSession[] = ((sessionsResult.data || []) as unknown as Session[]).map(
        (session: Session) => {
          const { deviceName, browserName, osName } = parseUserAgent(
            session.userAgent
          );
          return {
            ...session,
            deviceName,
            browserName,
            osName,
            isCurrent: session.token === currentToken,
          };
        }
      );

      // Sort: current session first, then by creation date
      parsed.sort((a, b) => {
        if (a.isCurrent) return -1;
        if (b.isCurrent) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      setSessions(parsed);
    } catch {
      console.error("Error fetching sessions");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRevokeSession = async (session: ParsedSession) => {
    setIsRevoking(session.id);
    try {
      const { error } = await revokeSession({
        token: session.token,
      });

      if (error) {
        toast.error(error.message || t("revokeError"));
        return;
      }

      toast.success(t("revokeSuccess"));
      setRevokeDialogSession(null);
      fetchSessions();
    } catch {
      toast.error(t("revokeError"));
    } finally {
      setIsRevoking(null);
    }
  };

  const handleRevokeAllSessions = async () => {
    setIsRevokingAll(true);
    try {
      const { error } = await revokeSessions();

      if (error) {
        toast.error(error.message || t("revokeAllError"));
        return;
      }

      toast.success(t("revokeAllSuccess"));
      setShowRevokeAllDialog(false);
      fetchSessions();
    } catch {
      toast.error(t("revokeAllError"));
    } finally {
      setIsRevokingAll(false);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const otherSessionsCount = sessions.filter((s) => !s.isCurrent).length;

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
            <Shield className="h-5 w-5" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noSessions")}</p>
          ) : (
            sessions.map((session) => {
              const { deviceType } = parseUserAgent(session.userAgent);
              const DeviceIcon = getDeviceIcon(deviceType);

              return (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <DeviceIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{session.browserName}</p>
                        {session.isCurrent && (
                          <Badge variant="secondary" className="text-xs">
                            {t("currentSession")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {session.osName}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {session.ipAddress && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {session.ipAddress}
                          </span>
                        )}
                        <span>{formatDate(session.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  {!session.isCurrent && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRevokeDialogSession(session)}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
        {otherSessionsCount > 0 && (
          <CardFooter>
            <Button
              variant="outline"
              onClick={() => setShowRevokeAllDialog(true)}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {t("revokeAll", { count: otherSessionsCount })}
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* Revoke Single Session Dialog */}
      <Dialog
        open={!!revokeDialogSession}
        onOpenChange={(open) => !open && setRevokeDialogSession(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("revokeTitle")}</DialogTitle>
            <DialogDescription>
              {t("revokeDescription", {
                device: revokeDialogSession?.browserName || "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRevokeDialogSession(null)}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                revokeDialogSession && handleRevokeSession(revokeDialogSession)
              }
              disabled={isRevoking === revokeDialogSession?.id}
            >
              {isRevoking === revokeDialogSession?.id ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {t("revokeConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke All Sessions Dialog */}
      <Dialog open={showRevokeAllDialog} onOpenChange={setShowRevokeAllDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("revokeAllTitle")}</DialogTitle>
            <DialogDescription>
              {t("revokeAllDescription", { count: otherSessionsCount })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRevokeAllDialog(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevokeAllSessions}
              disabled={isRevokingAll}
            >
              {isRevokingAll ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {t("revokeAllConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
