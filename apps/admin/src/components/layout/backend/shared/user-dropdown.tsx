"use client";

import * as React from "react";
import {
  Check,
  CreditCard,
  Globe,
  LogOut,
  Moon,
  Palette,
  Settings,
  Shield,
  ShieldX,
  Sun,
  Monitor,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { hasAdminAccess } from "@platform/auth-shared";
import { toast } from "sonner";

import { useTheme } from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { signOut, useSession, updateUser } from "@/lib/auth-client";
import { routing } from "@/i18n/routing";
import { stopAdminImpersonation } from "@/lib/services/admin";

interface UserDropdownProps {
  /** Show only avatar (true) or avatar + name/email (false) */
  compact?: boolean;
  className?: string;
}

const themeOptions = [
  { value: "light", icon: Sun, key: "light" },
  { value: "dark", icon: Moon, key: "dark" },
  { value: "system", icon: Monitor, key: "system" },
] as const;

const languageOptions = routing.locales.map((locale) => ({
  value: locale,
  key: locale,
}));

export function UserDropdown({ compact = false, className }: UserDropdownProps) {
  const t = useTranslations();
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const handleSignOut = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => router.push("/login"),
      },
    });
  };

  const handleLocaleChange = async (newLocale: string) => {
    localStorage.setItem("preferred-locale", newLocale);

    if (session?.user) {
      try {
        await updateUser({ locale: newLocale });
      } catch (error) {
        console.error("Failed to save locale preference:", error);
      }
    }

    router.replace(pathname, { locale: newLocale as "en" | "nl" | "fr" });
  };

  const handleStopImpersonating = async () => {
    try {
      const result = await stopAdminImpersonation();
      if ((result as { error?: unknown }).error) {
        toast.error(t("admin.impersonation.stopError"));
        return;
      }

      toast.success(t("admin.impersonation.stopped"));
      router.push("/admin/overview");
      router.refresh();
    } catch {
      toast.error(t("admin.impersonation.stopError"));
    }
  };

  const userInitial = session?.user?.name?.charAt(0).toUpperCase() || "U";

  if (!mounted) {
    return compact ? (
      <Button
        variant="ghost"
        className={cn(
          "h-8 w-8 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors p-0",
          className
        )}
        disabled
        aria-hidden="true"
      >
        <span className="text-sm font-medium text-primary">{userInitial}</span>
      </Button>
    ) : (
      <Button
        variant="ghost"
        className={cn(
          "h-auto w-full justify-start gap-3 py-2 hover:bg-muted",
          className
        )}
        disabled
        aria-hidden="true"
      >
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-sm font-medium text-primary">{userInitial}</span>
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium truncate">&nbsp;</p>
          <p className="text-xs text-muted-foreground truncate">&nbsp;</p>
        </div>
      </Button>
    );
  }

  if (!session?.user) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button
            variant="ghost"
            className={cn(
              "h-8 w-8 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors p-0",
              className
            )}
          >
            <span className="text-sm font-medium text-primary">
              {userInitial}
            </span>
          </Button>
        ) : (
          <Button
            variant="ghost"
            className={cn(
              "h-auto w-full justify-start gap-3 py-2 hover:bg-muted",
              className
            )}
          >
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-sm font-medium text-primary">
                {userInitial}
              </span>
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium truncate">{session.user.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {session.user.email}
              </p>
            </div>
            {/* <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> */}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-56"
        align={compact ? "end" : "start"}
        sideOffset={8}
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{session.user.name}</p>
            <p className="text-xs text-muted-foreground">{session.user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette className="mr-2 h-4 w-4" />
              {t("theme.toggle")}
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {themeOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => setTheme(option.value)}
                  >
                    <option.icon className="mr-2 h-4 w-4" />
                    {t(`theme.${option.key}`)}
                    {theme === option.value && (
                      <Check className="ml-auto h-4 w-4" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Globe className="mr-2 h-4 w-4" />
              {t("language.select")}
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {languageOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => handleLocaleChange(option.value)}
                  >
                    {t(`language.${option.key}`)}
                    {locale === option.value && (
                      <Check className="ml-auto h-4 w-4" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="mr-2 h-4 w-4" />
            {t("dashboard.nav.settings")}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/billing">
            <CreditCard className="mr-2 h-4 w-4" />
            {t("dashboard.nav.billing")}
          </Link>
        </DropdownMenuItem>

        {hasAdminAccess(session.user) && (
          <DropdownMenuItem asChild>
            <Link href="/admin/overview">
              <Shield className="mr-2 h-4 w-4" />
              {t("dashboard.nav.admin")}
            </Link>
          </DropdownMenuItem>
        )}

        {session.session.impersonatedBy && (
          <DropdownMenuItem onClick={handleStopImpersonating}>
            <ShieldX className="mr-2 h-4 w-4" />
            {t("admin.impersonation.stop")}
          </DropdownMenuItem>
        )}

        <DropdownMenuItem
          onClick={handleSignOut}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {t("dashboard.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
