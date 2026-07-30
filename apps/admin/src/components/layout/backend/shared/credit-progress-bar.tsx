"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getMyApplicationConfig } from "@/lib/api/me";
import { getCreditBalance } from "@/lib/services/credits";
import { Loader2, Sparkles, Coins } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { adminQueryKeys } from "@/lib/query/keys";

export function CreditProgressBar() {
  const t = useTranslations("creditProgressBar");
  const { state } = useSidebar();

  const applicationConfigQuery = useQuery({
    queryKey: adminQueryKeys.applicationConfig,
    queryFn: getMyApplicationConfig,
    staleTime: 60_000,
  });
  const creditBalanceQuery = useQuery({
    queryKey: adminQueryKeys.creditBalance,
    queryFn: getCreditBalance,
    enabled: applicationConfigQuery.data?.billing.creditSurfacesEnabled === true,
    staleTime: 30_000,
  });

  if (applicationConfigQuery.isLoading || creditBalanceQuery.isLoading) {
    return (
      <>
        <div className="px-3 py-1">
          <div className="flex items-center justify-center py-1">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        </div>
        <div className="h-px w-full bg-muted-foreground/30" />
      </>
    );
  }

  if (applicationConfigQuery.isError || applicationConfigQuery.data?.billing.creditSurfacesEnabled !== true || creditBalanceQuery.isError) {
    return null;
  }

  const currentCredits = creditBalanceQuery.data?.balance || 0;

  const isCollapsed = state === "collapsed";

  return (
    <>
      <div className="px-3 pb-1">
        <div className={`rounded-lg p-2 ${isCollapsed ? "flex flex-col items-center gap-1.5" : "flex items-center justify-between gap-2"}`}>
          {/* Credits display */}
          <div className={`flex items-center ${isCollapsed ? "flex-col gap-0.5" : "gap-1.5"}`}>
            <Coins className="h-3.5 w-3.5 text-amber-500" />
            <span className={`font-medium text-amber-700 dark:text-amber-400 ${isCollapsed ? "text-xs" : "text-sm"}`}>
              {currentCredits.toLocaleString()}
            </span>
            {!isCollapsed && (
              <span className="text-xs text-amber-600/70 dark:text-amber-500/70">
                {t("credits")}
              </span>
            )}
          </div>

          {/* Upgrade button - only show when not collapsed */}
          {!isCollapsed && (
            <Link
              href="/billing"
              className="flex items-center gap-1.5 rounded-md bg-linear-to-r from-orange-200 to-orange-300 dark:from-orange-800 dark:to-orange-700 px-3 py-1.5 text-xs font-medium text-orange-800 dark:text-orange-100 hover:from-orange-300 hover:to-orange-400 dark:hover:from-orange-700 dark:hover:to-orange-600 transition-all"
            >
              <Sparkles className="h-3 w-3 text-amber-700 dark:text-amber-100" />
              <span>{t("upgrade")}</span>
            </Link>
          )}
        </div>
      </div>
      <div className="h-px w-full bg-muted-foreground/30" />
   
    </>
  );
}
