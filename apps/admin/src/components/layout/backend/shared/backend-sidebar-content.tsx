"use client"

import * as React from "react"

import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
} from "@/components/ui/sidebar"
import MobileSidebarClose from "@/components/layout/backend/shared/mobile-sidebar-close";
import BackendSidebarMenuItems from "@/components/layout/backend/shared/backend-sidebar-menuitems";

export function BackendSidebarContent() {
  return (
    <SidebarContent className="px-3 group-data-[collapsible=icon]:px-1">
      <MobileSidebarClose />
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu className="space-y-1">
            <BackendSidebarMenuItems />
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  )
}
