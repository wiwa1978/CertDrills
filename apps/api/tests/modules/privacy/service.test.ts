import { describe, expect, it, vi } from "vitest";

vi.mock("@platform/platform-db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/platform-db")>();
  return {
    ...actual,
    userDataExportRequests: {
      id: { name: "id" },
      userId: { name: "user_id" },
      status: { name: "status" },
      createdAt: { name: "created_at" },
    },
  };
});

import {
  buildUserDataExport,
  createPrivacyService,
  downloadUserDataExportCore,
  hashExportToken,
  sanitizeAuthAccount,
  sanitizeSession,
} from "../../../src/modules/privacy/service";

const fixedNow = new Date("2026-01-15T12:00:00.000Z");
const expiresAt = new Date("2026-01-22T12:00:00.000Z");

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "export-1",
    userId: "user-1",
    status: "ready",
    fileName: "user-data-export-export-1.json",
    fileSizeBytes: 123,
    downloadTokenHash: hashExportToken("download-token"),
    exportData: { profile: { id: "user-1" } },
    expiresAt,
    downloadedAt: null,
    failedReason: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides,
  };
}

describe("privacy data export redaction", () => {
  it("removes auth account tokens and stored passwords", () => {
    const sanitized = sanitizeAuthAccount({
      id: "account-1",
      accountId: "github-1",
      providerId: "github",
      userId: "user-1",
      accessToken: "secret-access-token",
      refreshToken: "secret-refresh-token",
      idToken: "secret-id-token",
      password: "hashed-secret-password",
      scope: "email profile",
      accessTokenExpiresAt: new Date("2026-02-01T00:00:00.000Z"),
      refreshTokenExpiresAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    expect(sanitized).toEqual({
      id: "account-1",
      accountId: "github-1",
      providerId: "github",
      scope: "email profile",
      accessTokenExpiresAt: "2026-02-01T00:00:00.000Z",
      refreshTokenExpiresAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(JSON.stringify(sanitized)).not.toContain("secret");
    expect(JSON.stringify(sanitized)).not.toContain("password");
  });

  it("removes session tokens while keeping session metadata", () => {
    const sanitized = sanitizeSession({
      id: "session-1",
      token: "secret-session-token",
      userId: "user-1",
      expiresAt: new Date("2026-03-01T00:00:00.000Z"),
      ipAddress: "203.0.113.1",
      userAgent: "Example Browser",
      impersonatedBy: "admin-1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    expect(sanitized).toEqual({
      id: "session-1",
      expiresAt: "2026-03-01T00:00:00.000Z",
      ipAddress: "203.0.113.1",
      userAgent: "Example Browser",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(JSON.stringify(sanitized)).not.toContain("secret-session-token");
    expect(JSON.stringify(sanitized)).not.toContain("admin-1");
  });

  it("builds an export bundle without sensitive fields", () => {
    const bundle = buildUserDataExport({
      generatedAt: new Date("2026-01-04T00:00:00.000Z"),
      user: {
        id: "user-1",
        name: "Ada Lovelace",
        email: "ada@example.com",
        emailVerified: true,
        image: null,
        role: "admin",
        locale: "en",
        phone: null,
        street: null,
        number: null,
        zipcode: null,
        town: null,
        countryId: null,
        banned: false,
        banReason: null,
        banExpires: null,
        twoFactorEnabled: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      authAccounts: [
        {
          id: "account-1",
          accountId: "github-1",
          providerId: "github",
          userId: "user-1",
          accessToken: "secret-access-token",
          refreshToken: "secret-refresh-token",
          idToken: "secret-id-token",
          password: "hashed-secret-password",
          scope: "email profile",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      ],
      sessions: [
        {
          id: "session-1",
          token: "secret-session-token",
          userId: "user-1",
          expiresAt: new Date("2026-03-01T00:00:00.000Z"),
          ipAddress: "203.0.113.1",
          userAgent: "Example Browser",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      ],
      notifications: [],
      creditBalance: null,
      creditTransactions: [],
      creditPurchases: [],
      voucherAssignments: [],
      voucherRedemptions: [],
      discountAssignments: [],
      auditReferences: [{ action: "auth.login", error: "stack trace" }],
    });

    const serialized = JSON.stringify(bundle);
    expect(serialized).not.toContain("secret-access-token");
    expect(serialized).not.toContain("secret-refresh-token");
    expect(serialized).not.toContain("secret-id-token");
    expect(serialized).not.toContain("secret-session-token");
    expect(serialized).not.toContain("hashed-secret-password");
    expect(serialized).not.toContain('"accessToken":');
    expect(serialized).not.toContain('"refreshToken":');
    expect(serialized).not.toContain('"idToken":');
    expect(serialized).not.toContain('"password":');
    expect(serialized).not.toContain('"token":');
    expect(serialized).not.toContain('"error":');
    expect(bundle.profile.role).toBe("admin");
    expect(bundle.profile.twoFactorEnabled).toBe(true);
  });
});

describe("downloadUserDataExportCore", () => {
  it("rejects exports owned by another user without leaking existence", () => {
    const result = downloadUserDataExportCore({
      userId: "other-user",
      request: makeRequest(),
      rawToken: "download-token",
      now: fixedNow,
    });

    expect(result).toEqual({ ok: false, error: "EXPORT_NOT_FOUND" });
  });

  it("rejects token hash mismatch", () => {
    const result = downloadUserDataExportCore({
      userId: "user-1",
      request: makeRequest(),
      rawToken: "wrong-token",
      now: fixedNow,
    });

    expect(result).toEqual({ ok: false, error: "EXPORT_NOT_FOUND" });
  });

  it("returns serialized JSON for ready exports owned by the current user", () => {
    const result = downloadUserDataExportCore({
      userId: "user-1",
      request: makeRequest(),
      rawToken: "download-token",
      now: fixedNow,
    });

    expect(result).toEqual({
      ok: true,
      id: "export-1",
      fileName: "user-data-export-export-1.json",
      contents: JSON.stringify({ profile: { id: "user-1" } }, null, 2),
    });
  });
});

describe("createPrivacyService", () => {
  it("does not cancel another user's export request", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const service = createPrivacyService({ db: { update } as any, now: () => fixedNow });

    await expect(service.cancelExport("user-1", "export-1")).resolves.toEqual({ ok: false, error: "EXPORT_NOT_FOUND" });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: "expired" }));
  });
});
