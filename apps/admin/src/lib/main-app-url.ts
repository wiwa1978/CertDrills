export function getMainAppDashboardUrl(locale: string) {
  const base = process.env.NEXT_PUBLIC_MAIN_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!base) return "";

  const normalized = base.replace(/\/$/, "");
  return `${normalized}/${locale}/dashboard`;
}
