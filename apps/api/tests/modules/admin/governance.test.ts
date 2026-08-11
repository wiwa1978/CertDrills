import { describe, expect, it } from "vitest";

import { checkSetRoleGovernance, isImpersonatedSession } from "../../../src/modules/admin/governance";

describe("admin governance helpers", () => {
  it("requires reasons for actual role changes", () => {
    expect(checkSetRoleGovernance({ previousRole: "user", nextRole: "admin" })).toEqual({
      allowed: false,
      error: "A reason is required for role changes.",
    });

    expect(checkSetRoleGovernance({ previousRole: "user", nextRole: "admin", reason: "Support escalation" })).toEqual({
      allowed: true,
    });
  });

  it("requires confirmation and active admin counts for admin demotions", () => {
    expect(checkSetRoleGovernance({ previousRole: "admin", nextRole: "user", reason: "Offboarding" })).toEqual({
      allowed: false,
      error: "Explicit confirmation is required to remove admin access.",
    });

    expect(checkSetRoleGovernance({ previousRole: "admin", nextRole: "user", reason: "Offboarding", confirmed: true })).toEqual({
      allowed: false,
      error: "Active admin count is required to safely authorize this demotion.",
    });

    expect(checkSetRoleGovernance({ previousRole: "admin", nextRole: "user", reason: "Offboarding", confirmed: true, activeAdminCount: 1 })).toEqual({
      allowed: false,
      error: "Cannot demote the last active admin.",
    });
  });

  it("allows no-op role writes without extra governance", () => {
    expect(checkSetRoleGovernance({ previousRole: "admin", nextRole: "admin" })).toEqual({ allowed: true });
  });

  it("detects impersonated sessions", () => {
    expect(isImpersonatedSession({ impersonatedBy: "admin-user" })).toBe(true);
    expect(isImpersonatedSession({ impersonatedBy: null })).toBe(false);
    expect(isImpersonatedSession(null)).toBe(false);
  });
});
