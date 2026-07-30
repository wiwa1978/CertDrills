"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { stripLocaleFromPath } from "@/lib/utils"


import { SidebarFooter, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { UserDropdown } from "@/components/layout/backend/shared/user-dropdown"
import { CreditProgressBar } from "@/components/layout/backend/shared/credit-progress-bar"
import  { AdminGoBackPortal } from "@/components/layout/backend/shared/admin-go-back-portal"

export function BackendSidebarFooter() {
  const pathname = usePathname()
  const normalizedPath = stripLocaleFromPath(pathname)
  const isAdminRoute = normalizedPath.startsWith("/admin")

  return (
    <SidebarFooter className="bg-muted/30 border-t pt-2">
      <CreditProgressBar />
    {isAdminRoute && <AdminGoBackPortal />}
      <div className="h-px w-full bg-muted-foreground/30" />
      <div><UserDropdown /></div>
    </SidebarFooter>
  )
}
