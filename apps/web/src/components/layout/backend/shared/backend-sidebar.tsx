import { Sidebar } from "@/components/ui/sidebar"

import { BackendSidebarHeader } from "./backend-sidebar-header"
import { BackendSidebarContent } from "./backend-sidebar-content"
import { BackendSidebarFooter } from "./backend-sidebar-footer"
import { Separator } from "@radix-ui/react-separator"

export function BackendSidebar() {
  return (
    <div style={{ '--sidebar-width-icon': '4rem' } as React.CSSProperties}>
      <Sidebar collapsible="icon" className="w-sidebar-width-icon">
        <BackendSidebarHeader />
        <Separator orientation="horizontal" className="h-px w-full bg-border/90" />
        <BackendSidebarContent />
        <BackendSidebarFooter />
      </Sidebar>
    </div>
  )
}
