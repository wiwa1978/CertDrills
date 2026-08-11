"use client";

import { ReactNode } from "react";
import { DashboardHeader } from "@/components/layout/backend/dashboard/header";
import { RecentActivity } from "@/components/layout/backend/dashboard/recent-activity";

interface ClientDashboardWrapperProps {
  children: ReactNode;
}

export function ClientDashboardWrapper({ children }: ClientDashboardWrapperProps) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <DashboardHeader />

      {/* Server-rendered stats cards */}
      {children}

      {/* Recent Activity */}
      <RecentActivity />
    </div>
  );
}
