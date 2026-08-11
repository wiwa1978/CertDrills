import { Boxes, FileText, LayoutDashboard, LucideIcon, Package, Settings, ShoppingCart, Wallet } from "lucide-react";
import { resolveProductNavigation } from "@platform/module-contracts";

import { productWebContributions } from "@/composition/product";

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
    transactionSurfacesEnabled?: boolean;
  };
  capabilities?: string[];
} | null | undefined;

const productNavigationIcons: Record<string, LucideIcon> = {
  boxes: Boxes,
  file: FileText,
  package: Package,
  cart: ShoppingCart,
};


export const BackendNavItems: BackendNavDashboardItem[] = [
  {
    title: "dashboard.nav.overview",
    url: "/dashboard",
    icon: LayoutDashboard,
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
  const billingEnabled = config?.billing?.creditSurfacesEnabled === true
    || config?.billing?.subscriptionSurfacesEnabled === true
    || config?.billing?.transactionSurfacesEnabled === true;

  return billingEnabled;
}

function filterBillingSurfaceItems<T extends { requiresBillingSurface?: true }>(items: T[], config: BillingSurfaceConfig): T[] {
  const billingEnabled = hasBillingSurface(config);

  return items.filter((item) => !item.requiresBillingSurface || billingEnabled);
}

export function getBackendNavItems(config: BillingSurfaceConfig): BackendNavDashboardItem[] {
  const platformItems = filterBillingSurfaceItems(BackendNavItems, config);
  const productItems = resolveProductNavigation(productWebContributions, config?.capabilities).map((item) => ({
    title: item.labelKey,
    url: item.href,
    icon: productNavigationIcons[item.iconKey ?? ""] ?? Package,
  }));
  return [...platformItems, ...productItems];
}

export function getUserDropdownNavItems(config: BillingSurfaceConfig): BackendNavDashboardItem[] {
  return filterBillingSurfaceItems(UserDropdownNavItems, config);
}
