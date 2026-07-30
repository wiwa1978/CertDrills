"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
