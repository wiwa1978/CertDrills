import * as React from "react"

import { SidebarHeader } from "@/components/ui/sidebar"
import { SidebarGroupLabel } from "@/components/ui/sidebar";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { Logo, LogoWithText } from "@/components/icons/logo";
import { cn } from "@/lib/utils";

export function BackendSidebarHeader() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <SidebarHeader>
      <SidebarGroupLabel
            className={cn(
              "text-primary flex flex-col items-start justify-center py-6",
              // Use less padding when collapsed, more when expanded
              collapsed ? "px-2" : "px-6",
              // Prevent hiding and shifting in collapsed state
              "mt-0! opacity-100! group-data-[collapsible=icon]:mt-0! group-data-[collapsible=icon]:opacity-100!"
            )}
          >
          <Link href="/dashboard">
            {collapsed ? <Logo /> : <LogoWithText />}
          </Link>
      </SidebarGroupLabel>
    </SidebarHeader>
  )
}
