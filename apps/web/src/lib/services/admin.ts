import { stopAdminImpersonationApi } from "@/lib/api/admin";

export async function stopAdminImpersonation(): ReturnType<typeof stopAdminImpersonationApi> {
  return stopAdminImpersonationApi();
}
