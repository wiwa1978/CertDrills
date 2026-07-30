import { afterEach, describe, expect, it, vi } from "vitest";

const baseEnv = {
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/test",
  APP_URL: "http://localhost:3200",
  API_URL: "http://localhost:8877",
  BETTER_AUTH_SECRET: "this-is-a-long-enough-secret",
  JWT_SECRET: "this-is-a-long-enough-jwt-secret",
};

async function loadEnv(featureFlagValue?: string) {
  vi.resetModules();
  vi.unstubAllEnvs();

  for (const [key, value] of Object.entries(baseEnv)) {
    vi.stubEnv(key, value);
  }

  if (featureFlagValue !== undefined) {
    vi.stubEnv("FEATURE_CERTDRILL_ENABLED", featureFlagValue);
  }

  return import("../src/env");
}

describe("api env", () => {
  afterEach(() => {
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
    const { env } = await loadEnv(value);
    expect(env.FEATURE_CERTDRILL_ENABLED).toBe(expected);
  });
});
