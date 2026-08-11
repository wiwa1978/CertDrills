"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  buildTransactionSectionHref,
  type TransactionAdminBillingSection,
} from "./transaction-finance-dashboard-helpers";

export type AdminBillingSection = "overview" | "discounts" | "vouchers";

type AdminBillingTabsProps = {
  activeSection: AdminBillingSection;
  children: React.ReactNode;
};

export function AdminBillingTabs({ activeSection, children }: AdminBillingTabsProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleTabChange(value: string) {
    const nextSection = value as AdminBillingSection;
    const nextParams = new URLSearchParams(searchParams.toString());

    if (nextSection === "overview") {
      nextParams.delete("section");
    } else {
      nextParams.set("section", nextSection);
    }

    const query = nextParams.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <Tabs value={activeSection} onValueChange={handleTabChange} className="space-y-6">
      <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
        <TabsTrigger value="overview">{t("admin.nav.billing")}</TabsTrigger>
        <TabsTrigger value="discounts">{t("admin.nav.discounts")}</TabsTrigger>
        <TabsTrigger value="vouchers">{t("admin.nav.vouchers")}</TabsTrigger>
      </TabsList>
      <div>{children}</div>
    </Tabs>
  );
}

type TransactionAdminBillingTabsProps = {
  activeSection: TransactionAdminBillingSection;
  children: React.ReactNode;
};

type HorizontalBounds = Pick<DOMRect, "left" | "right">;

export function shouldScrollActiveNavItem(container: HorizontalBounds, item: HorizontalBounds) {
  return item.left < container.left || item.right > container.right;
}

export function TransactionAdminBillingTabs({ activeSection, children }: TransactionAdminBillingTabsProps) {
  const transactionT = useTranslations("admin.billing.transactionsMode");
  const adminT = useTranslations("admin");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navRef = React.useRef<HTMLElement>(null);
  const activeLinkRef = React.useRef<HTMLAnchorElement>(null);
  const items = [
    { section: "overview", label: transactionT("tabs.overview") },
    { section: "orders", label: transactionT("tabs.orders") },
    { section: "refunds", label: transactionT("tabs.refunds") },
    { section: "products", label: transactionT("tabs.products") },
    { section: "discounts", label: adminT("nav.discounts") },
    { section: "vouchers", label: adminT("nav.vouchers") },
  ].map((item) => ({
    ...item,
    href: buildTransactionSectionHref(pathname, searchParams, item.section),
  }));

  React.useEffect(() => {
    const container = navRef.current;
    const activeLink = activeLinkRef.current;
    if (!container || !activeLink || !shouldScrollActiveNavItem(container.getBoundingClientRect(), activeLink.getBoundingClientRect())) return;
    activeLink.scrollIntoView?.({ block: "nearest", inline: "center" });
  }, [activeSection]);

  return (
    <div className="space-y-6">
      <nav ref={navRef} aria-label={transactionT("tabs.label")} className="overflow-x-auto pb-1">
        <div className="flex h-9 min-w-max items-center justify-start gap-1 rounded-lg bg-muted p-[3px] text-muted-foreground md:grid md:w-full md:min-w-0 md:grid-cols-6">
          {items.map(({ section, label, href }) => {
            const active = section === activeSection;
            return (
              <Link
                key={section}
                ref={active ? activeLinkRef : undefined}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-[calc(100%-1px)] min-w-32 items-center justify-center whitespace-nowrap rounded-md border border-transparent px-2 py-1 text-sm font-medium text-foreground transition-[color,box-shadow] focus-visible:border-ring focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:w-full md:min-w-0 dark:text-muted-foreground",
                  active && "bg-background shadow-sm dark:border-input dark:bg-input/30 dark:text-foreground",
                )}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
      <TransactionSectionHeading activeSection={activeSection} />
      <div>{children}</div>
    </div>
  );
}

function TransactionSectionHeading({ activeSection }: { activeSection: TransactionAdminBillingSection }) {
  const t = useTranslations("admin");
  if (activeSection !== "discounts" && activeSection !== "vouchers") return null;

  return <h1 className="sr-only">{t(`${activeSection}.title`)}</h1>;
}
