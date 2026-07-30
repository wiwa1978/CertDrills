import {
  Bell,
  BookOpenCheck,
  CreditCard,
  ListChecks,
  ServerCog,
  ShieldCheck,
  LayoutDashboard,
  LucideIcon,
  Logs,
  Users,
  Webhook
} from "lucide-react"

export interface BackendNavAdminItem {
  title: string
  url: string
  icon: LucideIcon
}


export const BackendNavAdminItems: BackendNavAdminItem[] = [
  {
    title: "admin.nav.overview",
    url: "/admin/overview",
    icon: LayoutDashboard,
  },

  {
    title: "admin.nav.certdrill",
    url: "/admin/certdrill",
    icon: BookOpenCheck,
  },

  {
    title: "admin.nav.system",
    url: "/admin/system",
    icon: ServerCog,
  },

  {
    title: "admin.nav.admins",
    url: "/admin/admins",
    icon: ShieldCheck,
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
