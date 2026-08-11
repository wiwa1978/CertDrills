import { env } from "../env";

export function createAuthRealmConfig(realm: "public" | "admin") {
  if (realm === "admin") {
    if (!env.ADMIN_APP_URL) {
      throw new Error("ADMIN_APP_URL is required for admin authentication");
    }

    return {
      basePath: "/admin-auth" as const,
      cookiePrefix: "better-auth-admin" as const,
      applicationUrl: env.ADMIN_APP_URL,
      includePublicPlugins: false,
    };
  }

  return {
    basePath: "/auth" as const,
    cookiePrefix: "better-auth" as const,
    applicationUrl: env.APP_URL,
    includePublicPlugins: true,
  };
}
