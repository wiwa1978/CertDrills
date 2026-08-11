"use client"

import * as React from "react"

import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { BackendSidebar } from "./backend-sidebar"
import { BackendTopbar } from "./backend-topbar"

export interface DashboardSidebarProps {
  children: React.ReactNode
}

export function DashboardSidebar({ children }: DashboardSidebarProps) {
  return (
    <SidebarProvider>
      <BackendSidebar />
      <SidebarInset className="flex h-screen flex-col">
        <BackendTopbar />
        <main className="from-background to-muted/20 flex-1 overflow-y-auto bg-linear-to-br p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
    
  )
}
