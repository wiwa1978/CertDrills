import * as React from "react"
import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { BackendBannerNotification } from "@/components/layout/backend/shared/backend-banner-notification"
import { DashboardSidebar } from "@/components/layout/backend/shared/dashboard-sidebar"
import { DashboardNavProvider } from "@/components/providers/backend-nav-provider"
import { TransactionCartProvider } from "@/components/providers/transaction-cart-provider"
import { getMyApplicationConfigForLayoutServer } from "@/lib/api/me.server";
import { getServerSession } from "@/lib/auth-session";

export const metadata: Metadata = {
  title: "Dashboard - CertDrills",
  description: "CertDrills customer dashboard",
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
  const applicationConfig = await getMyApplicationConfigForLayoutServer();

  return (
    <DashboardNavProvider initialApplicationConfig={applicationConfig}>
      <TransactionCartProvider userId={session.user.id} initialApplicationConfig={applicationConfig}>
        <DashboardSidebar>
          <BackendBannerNotification locale={locale} />
          {children}
        </DashboardSidebar>
      </TransactionCartProvider>
    </DashboardNavProvider>
  )

}
