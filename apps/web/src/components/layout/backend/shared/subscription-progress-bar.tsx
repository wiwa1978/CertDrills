"use client";

import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Loader2, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { getMyApplicationConfig, getMySubscription } from "@/lib/api/me";
import { useSidebar } from "@/components/ui/sidebar";
import { webQueryKeys } from "@/lib/query/keys";

export function SubscriptionProgressBar() {
  const t = useTranslations("subscriptionProgressBar");
  const locale = useLocale();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const noSubscriptionLabel = locale === "nl"
    ? "Geen abonnement"
    : locale === "fr"
      ? "Aucun abonnement"
      : "No subscription";
  const loadingLabel = locale === "nl"
    ? "Laden..."
    : locale === "fr"
      ? "Chargement..."
      : "Loading...";
  const applicationConfigQuery = useQuery({
    queryKey: webQueryKeys.applicationConfig,
    queryFn: getMyApplicationConfig,
    staleTime: 60_000,
  });
  const subscriptionQuery = useQuery({
    queryKey: webQueryKeys.subscription,
    queryFn: getMySubscription,
    enabled: applicationConfigQuery.data?.billing.subscriptionSurfacesEnabled === true,
    staleTime: 30_000,
  });

  if (applicationConfigQuery.data?.billing.subscriptionSurfacesEnabled !== true) {
    return null;
  }

  const plan = subscriptionQuery.isLoading
    ? loadingLabel
    : subscriptionQuery.data?.planKey ?? noSubscriptionLabel;
  const planClassName = subscriptionQuery.data
    ? "text-emerald-700 dark:text-emerald-400"
    : "text-muted-foreground";

  return (
    <div className="px-3 pb-1">
      <div className={`rounded-lg p-2 ${isCollapsed ? "flex flex-col items-center gap-1.5" : "flex items-center justify-between gap-2"}`}>
        <div className={`flex items-center ${isCollapsed ? "flex-col gap-0.5" : "gap-1.5"}`}>
          {subscriptionQuery.isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : (
            <BadgeCheck className={`h-3.5 w-3.5 ${subscriptionQuery.data ? "text-emerald-500" : "text-muted-foreground"}`} />
          )}
          {!isCollapsed ? (
            <div className="leading-tight">
              <p className="text-xs text-muted-foreground">{t("label")}</p>
              <p className={`text-sm font-medium capitalize ${planClassName}`}>{plan}</p>
            </div>
          ) : null}
        </div>

        {!isCollapsed ? (
          <Link
            href="/billing"
            className="flex items-center gap-1.5 rounded-md bg-linear-to-r from-orange-200 to-orange-300 px-3 py-1.5 text-xs font-medium text-orange-800 transition-all hover:from-orange-300 hover:to-orange-400 dark:from-orange-800 dark:to-orange-700 dark:text-orange-100 dark:hover:from-orange-700 dark:hover:to-orange-600"
          >
            <Sparkles className="h-3 w-3 text-amber-700 dark:text-amber-100" />
            <span>{t("upgrade")}</span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
