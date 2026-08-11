"use client";

import { AlertTriangle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "@/i18n/navigation";
import { stopAdminImpersonation } from "@/lib/services/admin";

export function ImpersonationBanner() {
  const t = useTranslations("admin.impersonation");
  const router = useRouter();
  const { data: session } = useSession();

  // Only show banner if session is being impersonated
  if (!session?.session?.impersonatedBy) {
    return null;
  }

  const handleStopImpersonating = async () => {
    const result = await stopAdminImpersonation();
    if ((result as { error?: unknown }).error) {
      toast.error(t("stopError"));
    } else {
      toast.success(t("stopped"));
      router.push("/admin/users");
      router.refresh();
    }
  };

  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        <span className="text-sm font-medium">
          {t("active", { email: session.user.email })}
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleStopImpersonating}
        className="bg-amber-600 border-amber-700 text-amber-950 hover:bg-amber-700"
      >
        <X className="h-4 w-4 mr-1" />
        {t("stop")}
      </Button>
    </div>
  );
}
