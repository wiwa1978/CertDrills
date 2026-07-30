export type AdminRole = "user" | "admin";

export type GovernanceCheckResult =
  | { allowed: true; error?: undefined }
  | { allowed: false; error: string };

export type SetRoleGovernanceInput = {
  previousRole?: string | null;
  nextRole: AdminRole;
  reason?: string;
  confirmed?: boolean;
  activeAdminCount?: number;
};

export function isImpersonatedSession(session: unknown) {
  return (
    typeof session === "object" &&
    session !== null &&
    "impersonatedBy" in session &&
    typeof (session as { impersonatedBy?: unknown }).impersonatedBy === "string" &&
    (session as { impersonatedBy: string }).impersonatedBy.length > 0
  );
}

export function validateRoleChangeReason(reason: unknown): reason is string {
  return typeof reason === "string" && reason.trim().length > 0;
}

export function checkSetRoleGovernance(input: SetRoleGovernanceInput): GovernanceCheckResult {
  if (input.previousRole === input.nextRole) {
    return { allowed: true };
  }

  if (!validateRoleChangeReason(input.reason)) {
    return { allowed: false, error: "A reason is required for role changes." };
  }

  const demotingAdmin = input.previousRole === "admin" && input.nextRole !== "admin";
  if (!demotingAdmin) {
    return { allowed: true };
  }

  if (!input.confirmed) {
    return { allowed: false, error: "Explicit confirmation is required to remove admin access." };
  }

  if (input.activeAdminCount === undefined) {
    return { allowed: false, error: "Active admin count is required to safely authorize this demotion." };
  }

  if (input.activeAdminCount <= 1) {
    return { allowed: false, error: "Cannot demote the last active admin." };
  }

  return { allowed: true };
}

export function buildRoleChangeAuditMetadata(input: {
  previousRole?: string | null;
  nextRole: AdminRole;
  reason?: string;
}) {
  return {
    previousRole: input.previousRole ?? null,
    nextRole: input.nextRole,
    reason: input.reason?.trim() || null,
  };
}
