import {
  Breadcrumb,
  BreadcrumbList,
} from "@/components/ui/breadcrumb";
import  BreadcrumbPageClient  from "@/components/layout/backend/shared/breadcrumb-pageclient";
import {
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator";
export function BackendTopbarBreadcrumbs() {
  return (
    <div className="flex shrink-0 items-center gap-3">
        <SidebarTrigger className="hover:bg-muted -ml-1 h-8 w-8 transition-colors" />
        <Separator orientation="vertical" className="hidden md:block mr-2 h-6 data-[orientation=vertical]:h-6"/>
        <Breadcrumb className="hidden md:flex">
        <BreadcrumbList>
            <BreadcrumbPageClient />
        </BreadcrumbList>
        </Breadcrumb>
    </div>

  )
}
