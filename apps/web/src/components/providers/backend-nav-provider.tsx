"use client"

import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { ApplicationConfig } from "@platform/contracts"
import { getBackendNavItems, getUserDropdownNavItems } from "@/config/backend-navbar-dashboard"
import { getMyApplicationConfig } from "@/lib/api/me"
import { webQueryKeys } from "@/lib/query/keys"
import { createApplicationConfigSnapshot, matchesApplicationConfigSnapshot } from "./application-config-seed"

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

export function DashboardNavProvider({ children, initialApplicationConfig }: { children: React.ReactNode; initialApplicationConfig?: ApplicationConfig }) {
  const queryClient = useQueryClient()
  const [initialSnapshot] = React.useState(() => {
    const state = queryClient.getQueryState<ApplicationConfig>(webQueryKeys.applicationConfig)
    return createApplicationConfigSnapshot(state?.data, state?.dataUpdatedAt)
  })
  const applicationConfigQuery = useQuery({
    queryKey: webQueryKeys.applicationConfig,
    queryFn: getMyApplicationConfig,
    initialData: initialApplicationConfig,
    staleTime: 60_000,
  })
  const currentState = queryClient.getQueryState<ApplicationConfig>(webQueryKeys.applicationConfig)
  const useServerConfig = initialApplicationConfig !== undefined && matchesApplicationConfigSnapshot(
    initialSnapshot,
    currentState?.data,
    currentState?.dataUpdatedAt,
  )
  const applicationConfig = useServerConfig ? initialApplicationConfig : applicationConfigQuery.data

  React.useEffect(() => {
    if (!initialApplicationConfig) return
    const state = queryClient.getQueryState<ApplicationConfig>(webQueryKeys.applicationConfig)
    if (matchesApplicationConfigSnapshot(initialSnapshot, state?.data, state?.dataUpdatedAt)) {
      queryClient.setQueryData(webQueryKeys.applicationConfig, initialApplicationConfig)
    }
  }, [initialApplicationConfig, initialSnapshot, queryClient])

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
