export function getAdminAppOverviewUrl() {
  const base = process.env.NEXT_PUBLIC_ADMIN_APP_URL;
  if (!base) return "";

  return `${base.replace(/\/$/, "")}/admin/overview`;
}
