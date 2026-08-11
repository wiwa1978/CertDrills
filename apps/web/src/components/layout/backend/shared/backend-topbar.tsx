import { useSession } from "@/lib/auth-client";
import { BackendTopbarNotifications } from "@/components/layout/backend/shared/backend-topbar-notifications";
import { BackendTopbarCart } from "./backend-topbar-cart";
import { BackendTopbarBreadcrumbs } from "./backend-topbar-breadcrumbs";
import { BackendTopbarSearch } from "./backend-topbar-search";
import { BackendTopbarAppSwitcher } from "./backend-topbar-appswitcher";
import { BackendTopbarOrganizationSwitcher } from "./backend-topbar-organizationswitcher";
export function BackendTopbar() {
  const { data: session } = useSession();

  return (
    <header className="bg-background/95 supports-backdrop-filter:bg-background/60 sticky top-0 z-10 border-b border-border/90 px-3 py-3 backdrop-blur sm:px-6">
      <div className="flex w-full items-center justify-between">
        <BackendTopbarBreadcrumbs />
        <BackendTopbarSearch />
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <BackendTopbarAppSwitcher />
          <BackendTopbarCart />
          <BackendTopbarNotifications />
          {session?.user ? <BackendTopbarOrganizationSwitcher /> : null}
        </div>
      </div>
    </header>
  );
}
