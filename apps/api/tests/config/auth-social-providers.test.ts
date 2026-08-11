import { describe, expect, it } from "vitest";

import { buildSocialProviders } from "../../src/config/auth-social-providers";

const baseEnv = {
  GOOGLE_CLIENT_ID: "google-id",
  GOOGLE_CLIENT_SECRET: "google-secret",
  GITHUB_CLIENT_ID: "github-id",
  GITHUB_CLIENT_SECRET: "github-secret",
};

describe("buildSocialProviders", () => {
  it("omits all social providers when social auth is disabled", () => {
    expect(buildSocialProviders(baseEnv, { enableSocialAuth: false })).toEqual({});
  });

  it("includes configured social providers when social auth is enabled", () => {
    expect(buildSocialProviders(baseEnv, { enableSocialAuth: true })).toEqual({
      google: {
        clientId: "google-id",
        clientSecret: "google-secret",
      },
      github: {
        clientId: "github-id",
        clientSecret: "github-secret",
      },
    });
  });
});
