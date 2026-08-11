"use client";

import { User, Shield, Users, FileJson } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  ProfileCard,
  EmailChangeCard,
  ChangePasswordCard,
  TwoFactorCard,
  PasskeysCard,
  ActiveSessionsCard,
  LinkedAccountsCard,
  DeleteAccountCard,
  DataExportCard,
  ApiKeysCard,
} from "@/components/layout/backend/settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SettingsPage() {
  const t = useTranslations("settings");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Tabbed Settings */}
      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">{t("tabs.profile")}</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">{t("tabs.security")}</span>
          </TabsTrigger>
          <TabsTrigger value="accounts" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">{t("tabs.accounts")}</span>
          </TabsTrigger>
          <TabsTrigger value="privacy" className="gap-2">
            <FileJson className="h-4 w-4" />
            <span className="hidden sm:inline">{t("tabs.privacy")}</span>
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <ProfileCard />
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <ChangePasswordCard />
            <EmailChangeCard />
          </div>
          <TwoFactorCard />
          <PasskeysCard />
        </TabsContent>

        {/* Accounts Tab */}
        <TabsContent value="accounts" className="space-y-6">
          <LinkedAccountsCard />
          <ActiveSessionsCard />

          {/* Danger Zone */}
          <div className="space-y-4 pt-4">
            <h2 className="text-lg font-semibold text-destructive">
              {t("dangerZone")}
            </h2>
            <DeleteAccountCard />
          </div>
        </TabsContent>

        {/* Privacy Tab */}
        <TabsContent value="privacy" className="space-y-6">
          <ApiKeysCard />
          <DataExportCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
