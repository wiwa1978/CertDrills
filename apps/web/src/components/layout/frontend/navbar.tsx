"use client";

import * as React from "react";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LogoWithText } from "@/components/icons/logo";
import { ThemeToggle } from "@/components/layout/shared/theme-toggle";
import { LanguageSelector } from "@/components/layout/shared/language-selector";
import { Link, usePathname } from "@/i18n/navigation";
import { FrontendNavItems, FrontendAuthItems } from "@/config/frontend-navbar";
import { useSession } from "@/lib/auth-client";
import { useLocale } from "next-intl";

export function Navbar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const locale = useLocale();
  const { data: session } = useSession();
  const [isScrolled, setIsScrolled] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeHash, setActiveHash] = React.useState("");

  React.useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Track hash changes for anchor link highlighting
  React.useEffect(() => {
    const handleHashChange = () => {
      setActiveHash(window.location.hash);
    };

    // Set initial hash
    setActiveHash(window.location.hash);

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Check if a nav link is active
  const isLinkActive = (href: string) => {
    // For hash links like /#features
    if (href.includes("#")) {
      const hash = href.split("#")[1];
      return activeHash === `#${hash}`;
    }
    // For regular routes
    return pathname === href;
  };

  return (
    <header
      className={cn(
        "fixed top-0 z-50 w-full transition-all duration-300",
        isScrolled
          ? "border-b border-border/40 bg-background/80 backdrop-blur-lg"
          : "bg-transparent"
      )}
    >
      <Container>
        <nav className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <LogoWithText />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden items-center gap-8 md:flex">
            <ul className="flex items-center gap-6">
              {FrontendNavItems.map((item) => (
                <li key={item.url} title={item.url}>
                  <Link
                    href={item.url}
                    className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {t(item.title)}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              <LanguageSelector />
              {session?.user ? (
                <Button size="sm" asChild>
                  <a href={`/${locale}/dashboard`}>{t("dashboard")}</a>
                </Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={FrontendAuthItems.login.url}>{t(FrontendAuthItems.login.title)}</Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link href={FrontendAuthItems.signup.url}>{t(FrontendAuthItems.signup.title)}</Link>
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Mobile Navigation */}
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <LanguageSelector />
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">{t("toggleMenu")}</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SheetHeader className="sr-only">
                  <SheetTitle>{t("toggleMenu")}</SheetTitle>
                </SheetHeader>
                <div className="flex h-full flex-col">
                  {/* Logo */}
                  <div className="flex h-16 items-center border-b px-6">
                    <Link href="/" onClick={() => setIsOpen(false)}>
                      <LogoWithText />
                    </Link>
                  </div>

                  {/* Navigation */}
                  <nav className="flex-1 p-4">
                    <div className="space-y-1">
                      {FrontendNavItems.map((link) => (
                        <Link
                          key={link.url}
                          title={link.url}
                          href={link.url}
                          onClick={() => setIsOpen(false)}
                          className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                        >
                          {t(link.title)}
                        </Link>
                      ))}
                    </div>

                    {/* Auth buttons - under nav links with border */}
                    <div className="mt-4 space-y-2 border-t pt-4">
                      {session?.user ? (
                        <Button className="w-full" asChild>
                          <a href={`/${locale}/dashboard`} onClick={() => setIsOpen(false)}>
                            {t("dashboard")}
                          </a>
                        </Button>
                      ) : (
                        <>
                          <Button variant="outline" className="w-full" asChild>
                            <Link href={FrontendAuthItems.login.url} onClick={() => setIsOpen(false)}>
                              {t(FrontendAuthItems.login.title)}
                            </Link>
                          </Button>
                          <Button className="w-full" asChild>
                            <Link href={FrontendAuthItems.signup.url} onClick={() => setIsOpen(false)}>
                              {t(FrontendAuthItems.signup.title)}
                            </Link>
                          </Button>
                        </>
                      )}
                    </div>
                  </nav>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </nav>
      </Container>
    </header>
  );
}
