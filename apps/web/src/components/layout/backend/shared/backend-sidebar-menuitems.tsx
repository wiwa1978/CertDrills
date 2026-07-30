"use client";

import { usePathname } from "next/navigation";
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { stripLocaleFromPath } from "@/lib/utils";
import { useDashboardNav } from "@/components/providers/backend-nav-provider";

export default function BackendSidebarMenuItems() {
  const t = useTranslations();
  const path = usePathname();
  const { setOpenMobile, isMobile } = useSidebar();
  const { navItems } = useDashboardNav();

  type DashboardNavItemWithActive = typeof navItems[number] & { active: boolean };

  // Remove the locale prefix (e.g., /en, /fr, /nl) from the path
  const normalizedPath = stripLocaleFromPath(path);

  const items: DashboardNavItemWithActive[] = navItems.map((item) => ({
    ...item,
    active: normalizedPath === item.url,
  }));


  const handleMenuClick = () => {
    // Close mobile sidebar when clicking a menu item
    if (isMobile) {
      setOpenMobile(false);
    }
  };
  return (
    <>
      {items.map((item) => (
        <SidebarMenuItem key={item.url}>
          <SidebarMenuButton
            asChild
            // isActive={item.active}
            className={cn(
              "hover:bg-primary/10 hover:text-primary relative h-12 w-full justify-start rounded-lg px-3 group-data-[collapsible=icon]:px-1 py-2 text-sm font-medium transition-all duration-200",
              item.active && "text-primary "
            )}
          >
            <Link
              href={item.url}
              onClick={handleMenuClick}
              className="flex cursor-pointer items-center gap-3 [&>svg]:size-6! group relative"
            >
             
              <item.icon className="transition-colors duration-200 z-10 relative" />
              <span className="truncate z-10 relative">{t(item.title as Parameters<typeof t>[0])}</span>
             
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </>
  );
}
