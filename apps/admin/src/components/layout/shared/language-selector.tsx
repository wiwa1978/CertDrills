"use client";

import * as React from "react";
import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname, useRouter } from "@/i18n/navigation";
import { locales, type Locale } from "@/i18n/routing";
import { authClient, updateUser } from "@/lib/auth-client";

const LOCALE_STORAGE_KEY = "preferred-locale";

export function LanguageSelector() {
  const t = useTranslations("language");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" type="button" aria-label={t("select")}>
        <Globe className="h-5 w-5" />
      </Button>
    );
  }

  const handleLocaleChange = async (newLocale: Locale) => {
    // Save preference to localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
    }

    // If user is authenticated, save locale to database
    if (session?.user) {
      try {
        await updateUser({
          locale: newLocale,
        });
      } catch (error) {
        // Silently fail - localStorage is the fallback
        console.error("Failed to save locale preference:", error);
      }
    }

    // Navigate to new locale
    router.replace(pathname, { locale: newLocale });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <Globe className="h-5 w-5" />
          <span className="sr-only">{t("select")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onClick={() => handleLocaleChange(loc)}
            className={locale === loc ? "bg-accent" : ""}
          >
            <span>{t(loc)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
