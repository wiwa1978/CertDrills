import { afterEach, describe, expect, it } from "vitest";

import { getMainAppDashboardUrl } from "../../src/lib/main-app-url";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("admin main app url", () => {
  it("builds a main app dashboard URL without falling back to the API", () => {
    process.env.NEXT_PUBLIC_MAIN_APP_URL = "http://localhost:3300/";
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3302";

    expect(getMainAppDashboardUrl("nl")).toBe("http://localhost:3300/nl/dashboard");

    delete process.env.NEXT_PUBLIC_MAIN_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;

    expect(getMainAppDashboardUrl("en")).toBe("");

    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3200/";

    expect(getMainAppDashboardUrl("fr")).toBe("http://localhost:3200/fr/dashboard");
  });
});
