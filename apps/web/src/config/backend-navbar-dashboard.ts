import { BookOpen, LayoutDashboard, LucideIcon, Settings, Wallet } from "lucide-react";

export interface BackendNavDashboardItem {
  title: string;
  url: string;
  icon: LucideIcon;
  requiresBillingSurface?: true;
}

type BillingSurfaceConfig = {
  billing?: {
    creditSurfacesEnabled?: boolean;
    subscriptionSurfacesEnabled?: boolean;
  };
} | null | undefined;


export const BackendNavItems: BackendNavDashboardItem[] = [
  {
    title: "dashboard.nav.overview",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "dashboard.nav.exams",
    url: "/exams",
    icon: BookOpen,
  },
  {
    title: "dashboard.nav.billing",
    url: "/billing",
    icon: Wallet,
    requiresBillingSurface: true,
  },
];

export const UserDropdownNavItems: BackendNavDashboardItem[] = [
  {
    title: "dashboard.nav.attempts",
    url: "/profile/attempts",
    icon: BookOpen,
  },
  {
    title: "dashboard.nav.settings",
    url: "/settings",
    icon: Settings,
  },
  {
    title: "dashboard.nav.billing",
    url: "/billing",
    icon: Wallet,
    requiresBillingSurface: true,
  },
];

function hasBillingSurface(config: BillingSurfaceConfig) {
  const billingEnabled = config?.billing?.creditSurfacesEnabled === true || config?.billing?.subscriptionSurfacesEnabled === true;

  return billingEnabled;
}

function filterBillingSurfaceItems<T extends { requiresBillingSurface?: true }>(items: T[], config: BillingSurfaceConfig): T[] {
  const billingEnabled = hasBillingSurface(config);

  return items.filter((item) => !item.requiresBillingSurface || billingEnabled);
}

export function getBackendNavItems(config: BillingSurfaceConfig): BackendNavDashboardItem[] {
  return filterBillingSurfaceItems(BackendNavItems, config);
}

export function getUserDropdownNavItems(config: BillingSurfaceConfig): BackendNavDashboardItem[] {
  return filterBillingSurfaceItems(UserDropdownNavItems, config);
}
