import {
  Boxes,
  Bell,
  CreditCard,
  ListChecks,
  ServerCog,
  LayoutDashboard,
  LucideIcon,
  FileText,
  Logs,
  Package,
  ShoppingCart,
  Users,
  Webhook,
} from "lucide-react";
import { resolveProductNavigation } from "@platform/module-contracts";

import { productAdminContributions } from "@/composition/product";

export interface BackendNavAdminItem {
  title: string
  url: string
  icon: LucideIcon
}

const productNavigationIcons: Record<string, LucideIcon> = {
  boxes: Boxes,
  file: FileText,
  package: Package,
  cart: ShoppingCart,
};


export const BackendNavAdminItems: BackendNavAdminItem[] = [
   {
    title: "admin.nav.overview",
    url: "/admin/overview",
    icon: LayoutDashboard,
  },

  {
    title: "admin.nav.system",
    url: "/admin/system",
    icon: ServerCog,
  },


  {
    title: "admin.nav.users",
    url: "/admin/users",
    icon: Users,
  },

  {
    title: "admin.nav.billing",
    url: "/admin/billing",
    icon: CreditCard ,
  },
  {
    title: "admin.nav.webhooks",
    url: "/admin/webhooks",
    icon: Webhook,
  },
  {
    title: "admin.nav.operations",
    url: "/admin/operations",
    icon: ListChecks,
  },
  {
    title: "admin.nav.notifications",
    url: "/admin/notifications",
    icon: Bell,
  },
  {
    title: "admin.nav.logs",
    url: "/admin/logs",
    icon: Logs,
  },
  
]

export function getBackendNavAdminItems(): BackendNavAdminItem[] {
  const productItems = resolveProductNavigation(productAdminContributions).map((item) => ({
    title: item.labelKey,
    url: item.href,
    icon: productNavigationIcons[item.iconKey ?? ""] ?? Package,
  }));
  return [...BackendNavAdminItems, ...productItems];
}
