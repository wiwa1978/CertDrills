import { describe, expect, it } from "vitest";

import { createBasePlugins } from "../../../../packages/auth-client/src/web-shared";

describe("auth client feature flags", () => {
  it("omits optional auth plugins when their features are disabled", () => {
    const plugins = createBasePlugins({
      baseURL: "http://localhost:8877/auth",
      features: {
        billing: false,
        twoFactor: false,
        passkeys: false,
        magicLink: false,
      },
    });

    expect(plugins.length).toBe(1);
  });

  it("includes optional auth plugins when their features are enabled", () => {
    const plugins = createBasePlugins({
      baseURL: "http://localhost:8877/auth",
      features: {
        billing: true,
        twoFactor: true,
        passkeys: true,
        magicLink: true,
      },
    });

    expect(plugins.length).toBe(5);
  });
});
