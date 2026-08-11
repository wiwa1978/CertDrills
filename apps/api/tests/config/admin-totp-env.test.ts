import { afterEach, describe, expect, it, vi } from "vitest";

async function loadAdminTotpPolicy(value?: string) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/test");
  vi.stubEnv("APP_URL", "http://localhost:3300");
  vi.stubEnv("API_URL", "http://localhost:3302");
  vi.stubEnv("BETTER_AUTH_SECRET", "this-is-a-long-enough-secret");
  vi.stubEnv("JWT_SECRET", "this-is-a-long-enough-jwt-secret");
  vi.stubEnv("ADMIN_PORTAL_TOTP_REQUIRED", value);

  const { env } = await import("../../src/env");
  return env.ADMIN_PORTAL_TOTP_REQUIRED;
}

async function loadProductionAdminTotpPolicy(value?: string) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/test");
  vi.stubEnv("APP_URL", "https://app.example.test");
  vi.stubEnv("API_URL", "https://api.example.test");
  vi.stubEnv("ADMIN_APP_URL", "https://admin.example.test");
  vi.stubEnv("BETTER_AUTH_SECRET", "production-better-auth-secret-value-00000000");
  vi.stubEnv("JWT_SECRET", "production-jwt-secret-value-000000000000");
  vi.stubEnv("ADMIN_SECRET", "production-admin-secret-value-000000000");
  vi.stubEnv("BILLING_RECONCILIATION_SECRET", "production-billing-secret-value-0000000");
  vi.stubEnv("INNGEST_EVENT_KEY", "production-inngest-event-key");
  vi.stubEnv("INNGEST_SIGNING_KEY", "production-inngest-signing-key");
  vi.stubEnv("AZURE_PRIVACY_EXPORT_STORAGE_CONNECTION_STRING", "UseDevelopmentStorage=true");
  vi.stubEnv("DODO_TRANSACTIONS_BRAND_ID", "brnd_production_transactions");
  vi.stubEnv("ADMIN_PORTAL_TOTP_REQUIRED", value);

  const { env } = await import("../../src/env");
  return env.ADMIN_PORTAL_TOTP_REQUIRED;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("ADMIN_PORTAL_TOTP_REQUIRED", () => {
  it("defaults to false when omitted", async () => {
    await expect(loadAdminTotpPolicy()).resolves.toBe(false);
  });

  it("parses true", async () => {
    await expect(loadAdminTotpPolicy("true")).resolves.toBe(true);
  });

  it("parses false", async () => {
    await expect(loadAdminTotpPolicy("false")).resolves.toBe(false);
  });

  it("rejects invalid values", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(loadAdminTotpPolicy("yes")).rejects.toThrow("Invalid environment variables");
  });

  it("remains configurable in production", async () => {
    await expect(loadProductionAdminTotpPolicy("false")).resolves.toBe(false);
    await expect(loadProductionAdminTotpPolicy("true")).resolves.toBe(true);
  });
});
