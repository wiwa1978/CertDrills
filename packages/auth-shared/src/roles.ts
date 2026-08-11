export const AUTH_ROLES = ["user", "admin"] as const;

export type AuthRole = (typeof AUTH_ROLES)[number];

export type AuthUserLike = {
  role?: string | null;
  email?: string | null;
};

export function isAuthRole(value: string | null | undefined): value is AuthRole {
  return value === "user" || value === "admin";
}

export function normalizeAuthRole(value: string | null | undefined): AuthRole {
  return isAuthRole(value) ? value : "user";
}

export function hasAdminAccess(user: AuthUserLike | null | undefined): boolean {
  return normalizeAuthRole(user?.role) === "admin";
}

export function normalizeAuthEmail(email: string | null | undefined): string {
  return email?.toLowerCase().trim() ?? "";
}
