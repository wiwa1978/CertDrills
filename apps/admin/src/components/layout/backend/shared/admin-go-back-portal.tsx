"use client";

import { SidebarFooter, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { useTranslations } from "next-intl";
import { ArrowLeftToLine } from "lucide-react"
import { usePathname } from "next/navigation";
import { getPathLocale } from "@/i18n/path-locale";
import { getMainAppDashboardUrl } from "@/lib/main-app-url";


export function AdminGoBackPortal() {
  const t = useTranslations("");
  const pathname = usePathname();
  const { activeLocale } = getPathLocale(pathname);
  const dashboardUrl = getMainAppDashboardUrl(activeLocale);

  if (!dashboardUrl) {
    return null;
  }

  return (
    <>
    <SidebarMenu className="space-y-1">
      <SidebarMenuItem>
        <SidebarMenuButton asChild className="text-muted-foreground hover:bg-primary/10 hover:text-primary h-auto w-full justify-start rounded-lg py-2 transition-all duration-200">
          <a href={dashboardUrl} className="flex cursor-pointer items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <ArrowLeftToLine className="h-4 w-4 transition-colors duration-200" />
            </div>
            <span className="text-sm font-medium">Go to User Panel</span>
          </a>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
    </>
  );  
}
