import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { routing, type Locale } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";
import { ClientLogBridgeProvider } from "@/components/providers/client-log-bridge-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ToasterProvider } from "@/components/providers/toaster-provider";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  // Validate locale
  if (!routing.locales.includes(locale as Locale)) {
    notFound();
  }

  // Enable static rendering
  setRequestLocale(locale);

  // Get messages for client components
  const messages = await getMessages();

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ToasterProvider />
      <ClientLogBridgeProvider />
      <NextIntlClientProvider messages={messages}>
        <QueryProvider>
          <div className="relative flex min-h-screen flex-col">
            {children}
          </div>
        </QueryProvider>
      </NextIntlClientProvider>
    </ThemeProvider>
  );
}
