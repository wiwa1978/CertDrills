import { apiRequest } from "./client";

export async function stopAdminImpersonationApi() {
  return apiRequest<{ session?: unknown; user?: unknown; error?: { message?: string } | string }>(
    "/auth/admin/stop-impersonating",
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}
