import { afterEach, describe, expect, it } from "vitest";

import { getAdminAppOverviewUrl } from "../../src/lib/admin-app-url";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("admin app url", () => {
  it("builds the admin overview URL for the configured admin app", () => {
    process.env.NEXT_PUBLIC_ADMIN_APP_URL = "http://localhost:3200/";

    expect(getAdminAppOverviewUrl()).toBe("http://localhost:3200/admin/overview");
  });

  it("returns an empty URL when no admin app is configured", () => {
    delete process.env.NEXT_PUBLIC_ADMIN_APP_URL;

    expect(getAdminAppOverviewUrl()).toBe("");
  });
});
