import { describe, expect, it } from "vitest";

import { createBasePlugins } from "../../../../packages/auth-client/src/web-shared";

describe("auth client plugins", () => {
  it("installs the full typed plugin set while UI feature flags control exposure", () => {
    const plugins = createBasePlugins();

    expect(plugins).toHaveLength(5);
    expect(new Set(plugins.map((plugin) => plugin.id)).size).toBe(5);
  });
});
