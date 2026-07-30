import * as React from "react"
import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { BackendBannerNotification } from "@/components/layout/backend/shared/backend-banner-notification"
import { DashboardSidebar } from "@/components/layout/backend/shared/dashboard-sidebar"
import { DashboardNavProvider } from "@/components/providers/backend-nav-provider"
import { getServerSession } from "@/lib/auth-session";

export const metadata: Metadata = {
  title: "(Web) - Single Tenant with API SaaS boilerplate",
  description: "(Web) - Single Tenant with API SaaS boilerplate",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params;
  const session = await getServerSession();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <DashboardNavProvider>
      <DashboardSidebar>
        <BackendBannerNotification locale={locale} />
        {children}
      </DashboardSidebar>
    </DashboardNavProvider>
  )

}
