import { afterEach, describe, expect, it, vi } from "vitest";

const baseEnv = {
  DATABASE_URL: "******localhost:5432/test",
  APP_URL: "http://localhost:3200",
  API_URL: "http://localhost:8877",
  BETTER_AUTH_SECRET: "this-is-a-long-enough-secret",
  JWT_SECRET: "this-is-a-long-enough-jwt-secret",
};

async function loadEnv(overrides: Record<string, string> = {}) {
  vi.resetModules();
  vi.unstubAllEnvs();

  for (const [key, value] of Object.entries(baseEnv)) {
    vi.stubEnv(key, value);
  }

  for (const [key, value] of Object.entries(overrides)) {
    vi.stubEnv(key, value);
  }

  return import("../src/env");
}

describe("api env", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults CertDrill feature flag to enabled", async () => {
    const { env } = await loadEnv();
    expect(env.FEATURE_CERTDRILL_ENABLED).toBe(true);
  });

  it.each([
    ["true", true],
    ["1", true],
    ["false", false],
    ["0", false],
  ])("parses FEATURE_CERTDRILL_ENABLED=%s as %s", async (value, expected) => {
    const { env } = await loadEnv({ FEATURE_CERTDRILL_ENABLED: value });
    expect(env.FEATURE_CERTDRILL_ENABLED).toBe(expected);
  });

  it("parses AZURE_AI_FOUNDRY_PROJECT_ENDPOINT and strips the legacy responses URL setting", async () => {
    const { env } = await loadEnv({
      AZURE_AI_FOUNDRY_PROJECT_ENDPOINT: "https://example.services.ai.azure.com/api/projects/certdrills",
      AZURE_AI_FOUNDRY_RESPONSES_URL: "https://example.services.ai.azure.com/models/responses?api-version=preview",
    });

    expect(env.AZURE_AI_FOUNDRY_PROJECT_ENDPOINT).toBe(
      "https://example.services.ai.azure.com/api/projects/certdrills",
    );
    expect("AZURE_AI_FOUNDRY_RESPONSES_URL" in env).toBe(false);
  });

  it("rejects an invalid AZURE_AI_FOUNDRY_PROJECT_ENDPOINT", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(loadEnv({
      AZURE_AI_FOUNDRY_PROJECT_ENDPOINT: "not a url",
    })).rejects.toThrow("Invalid environment variables");
    expect(consoleError).toHaveBeenCalledOnce();
  });
});
