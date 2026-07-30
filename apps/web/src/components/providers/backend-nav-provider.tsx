"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { getBackendNavItems, getUserDropdownNavItems } from "@/config/backend-navbar-dashboard"
import { getMyApplicationConfig } from "@/lib/api/me"
import { webQueryKeys } from "@/lib/query/keys"

export interface DashboardNavItem {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
}

interface DashboardNavContextValue {
  navItems: DashboardNavItem[]
  userDropdownNavItems: DashboardNavItem[]
}

const DashboardNavContext = React.createContext<DashboardNavContextValue | undefined>(undefined)

export function DashboardNavProvider({ children }: { children: React.ReactNode }) {
  const applicationConfigQuery = useQuery({
    queryKey: webQueryKeys.applicationConfig,
    queryFn: getMyApplicationConfig,
    staleTime: 60_000,
  })
  const applicationConfig = applicationConfigQuery.data

  return (
    <DashboardNavContext.Provider value={{
      navItems: getBackendNavItems(applicationConfig),
      userDropdownNavItems: getUserDropdownNavItems(applicationConfig),
    }}>
      {children}
    </DashboardNavContext.Provider>
  )
}

export function useDashboardNav() {
  const context = React.useContext(DashboardNavContext)
  if (context === undefined) {
    throw new Error("useDashboardNav must be used within a DashboardNavProvider")
  }
  return context
}
