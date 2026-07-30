export function getMainAppLoginUrl(locale: string) {
  const base = process.env.NEXT_PUBLIC_MAIN_APP_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const normalized = base.replace(/\/$/, "");
  return `${normalized}/${locale}/login`;
}

export function getMainAppDashboardUrl(locale: string) {
  const base = process.env.NEXT_PUBLIC_MAIN_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!base) return "";

  const normalized = base.replace(/\/$/, "");
  return `${normalized}/${locale}/dashboard`;
}
