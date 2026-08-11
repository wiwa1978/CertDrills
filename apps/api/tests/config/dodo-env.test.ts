import { afterEach, describe, expect, it, vi } from "vitest";

import type { BillingMode } from "../../src/config/application";

type DodoEnvironmentOptions = {
  apiKey?: string;
  webhookSecret?: string;
  nodeEnv?: "production" | "test";
  paymentProvider?: "dodo" | "stripe";
  billingMode?: BillingMode;
  brands?: Partial<Record<BillingMode, string>>;
};

async function loadDodoEnvironment(options: DodoEnvironmentOptions = {}) {
  vi.resetModules();
  const nodeEnv = options.nodeEnv ?? "test";
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/test");
  vi.stubEnv("APP_URL", nodeEnv === "production" ? "https://app.example.com" : "http://localhost:3100");
  vi.stubEnv("API_URL", nodeEnv === "production" ? "https://api.example.com" : "http://localhost:8787");
  vi.stubEnv("BETTER_AUTH_SECRET", "this-is-a-long-enough-production-secret");
  vi.stubEnv("JWT_SECRET", "this-is-a-long-enough-production-jwt-secret");
  vi.stubEnv("ADMIN_SECRET", "this-is-a-long-enough-production-admin-secret");
  vi.stubEnv("ADMIN_PORTAL_TOTP_REQUIRED", "true");
  vi.stubEnv("BILLING_RECONCILIATION_SECRET", "long-enough-production-reconciliation-secret");
  vi.stubEnv("INNGEST_EVENT_KEY", "production-inngest-event-key");
  vi.stubEnv("INNGEST_SIGNING_KEY", "production-inngest-signing-key");
  vi.stubEnv("AZURE_PRIVACY_EXPORT_STORAGE_CONNECTION_STRING", "UseDevelopmentStorage=true");
  vi.stubEnv("PAYMENT_PROVIDER", options.paymentProvider ?? "dodo");
  vi.stubEnv("DODO_PAYMENTS_API_KEY", options.apiKey);
  vi.stubEnv("DODO_PAYMENTS_WEBHOOK_SECRET", options.webhookSecret);
  vi.stubEnv("DODO_CREDITS_BRAND_ID", options.brands?.credits);
  vi.stubEnv("DODO_SUBSCRIPTIONS_BRAND_ID", options.brands?.subscriptions);
  vi.stubEnv("DODO_TRANSACTIONS_BRAND_ID", options.brands?.transactions);

  const { applicationConfig } = await import("../../src/config/application");
  const originalMode = applicationConfig.billing.mode;
  (applicationConfig.billing as { mode: BillingMode }).mode = options.billingMode ?? originalMode;

  try {
    return await import("../../src/env");
  } finally {
    (applicationConfig.billing as { mode: BillingMode }).mode = originalMode;
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("Dodo environment configuration", () => {
  it("rejects a webhook secret without the API key required to mount its endpoint", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(loadDodoEnvironment({ webhookSecret: "dodo-webhook-secret" }))
      .rejects.toThrow("Invalid environment variables");
  });

  it("allows an API key without a webhook secret", async () => {
    const { env } = await loadDodoEnvironment({ apiKey: "dodo-api-key" });

    expect(env.DODO_PAYMENTS_API_KEY).toBe("dodo-api-key");
    expect(env.DODO_PAYMENTS_WEBHOOK_SECRET).toBeUndefined();
  });

  it.each([
    ["credits", "DODO_CREDITS_BRAND_ID"],
    ["subscriptions", "DODO_SUBSCRIPTIONS_BRAND_ID"],
    ["transactions", "DODO_TRANSACTIONS_BRAND_ID"],
  ] as const)("requires the active %s brand for Dodo in production", async (billingMode, brandKey) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(loadDodoEnvironment({
      nodeEnv: "production",
      billingMode,
      brands: { [billingMode]: "   " },
    })).rejects.toThrow("Invalid environment variables");

    expect(console.error).toHaveBeenCalledWith(
      "Invalid environment variables for api",
      expect.objectContaining({ [brandKey]: expect.any(Array) }),
    );
  });

  it.each([
    ["credits", "DODO_CREDITS_BRAND_ID"],
    ["subscriptions", "DODO_SUBSCRIPTIONS_BRAND_ID"],
    ["transactions", "DODO_TRANSACTIONS_BRAND_ID"],
  ] as const)("allows inactive brands to be omitted when %s is active", async (billingMode, brandKey) => {
    const { env } = await loadDodoEnvironment({
      nodeEnv: "production",
      billingMode,
      brands: { [billingMode]: `  brnd_${billingMode}  ` },
    });

    expect(env[brandKey]).toBe(`brnd_${billingMode}`);
  });

  it("does not require Dodo brands for Stripe in production", async () => {
    await expect(loadDodoEnvironment({
      nodeEnv: "production",
      paymentProvider: "stripe",
      billingMode: "transactions",
    })).resolves.toBeDefined();
  });
});
