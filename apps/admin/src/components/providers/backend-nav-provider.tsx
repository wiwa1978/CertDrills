"use client"

import * as React from "react"
import { BackendNavAdminItems } from "@/config/backend-navbar-admin"

export interface DashboardNavItem {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
}

interface DashboardNavContextValue {
  navItems: DashboardNavItem[]
}

const DashboardNavContext = React.createContext<DashboardNavContextValue | undefined>(undefined)

export function DashboardNavProvider({ children }: { children: React.ReactNode }) {
  const navItems = React.useMemo(() => BackendNavAdminItems, []);

  return (
    <DashboardNavContext.Provider value={{ navItems }}>
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
