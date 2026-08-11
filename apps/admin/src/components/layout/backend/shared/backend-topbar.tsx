import { useSession } from "@/lib/auth-client";
import {BackendTopbarNotifications} from "@/components/layout/backend/shared/backend-topbar-notifications";
import { BackendTopbarBreadcrumbs } from "./backend-topbar-breadcrumbs";
import { BackendTopbarSearch } from "./backend-topbar-search";
import { BackendTopbarAppSwitcher } from "./backend-topbar-appswitcher";
import { BackendTopbarOrganizationSwitcher } from "./backend-topbar-organizationswitcher";


export function BackendTopbar() {
  const { data: session } = useSession();

  return (
    <div>
        <header className="bg-background/95 supports-backdrop-filter:bg-background/60 sticky top-0 z-10 border-b border-border/90 px-6 py-3 backdrop-blur">
            <div className="flex items-center justify-between w-full">
              {/* Left section - Breadcrumbs */}
              <BackendTopbarBreadcrumbs />
               
              {/* Middle section - Search */}
              <BackendTopbarSearch />

              {/* Right section - App Switcher, Notifications, Organization Switcher */}
              <div className="flex shrink-0 items-center gap-3">
                  {/* App Switcher (placeholder) */}
                  <BackendTopbarAppSwitcher />

                  {/* Notifications */}
                  <BackendTopbarNotifications />

                  {/* Organization Switcher (placeholder) */}
                  {session?.user && ( <BackendTopbarOrganizationSwitcher />
                  
                  )}
              </div>
            </div>
        </header>
    </div>
  )
}
