import { afterEach, describe, expect, it } from "vitest";

import { getMainAppDashboardUrl, getMainAppLoginUrl } from "../../src/lib/main-app-url";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("admin main app url", () => {
  it("prefers NEXT_PUBLIC_MAIN_APP_URL", () => {
    process.env.NEXT_PUBLIC_MAIN_APP_URL = "http://localhost:3200/";
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8877";

    expect(getMainAppLoginUrl("nl")).toBe("http://localhost:3200/nl/login");
  });

  it("falls back to NEXT_PUBLIC_API_URL and NEXT_PUBLIC_APP_URL", () => {
    delete process.env.NEXT_PUBLIC_MAIN_APP_URL;
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8877/";

    expect(getMainAppLoginUrl("en")).toBe("http://localhost:8877/en/login");

    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3200";

    expect(getMainAppLoginUrl("fr")).toBe("http://localhost:3200/fr/login");
  });

  it("builds a main app dashboard URL without falling back to the API", () => {
    process.env.NEXT_PUBLIC_MAIN_APP_URL = "http://localhost:3200/";
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8877";

    expect(getMainAppDashboardUrl("nl")).toBe("http://localhost:3200/nl/dashboard");

    delete process.env.NEXT_PUBLIC_MAIN_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;

    expect(getMainAppDashboardUrl("en")).toBe("");

    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3200/";

    expect(getMainAppDashboardUrl("fr")).toBe("http://localhost:3200/fr/dashboard");
  });
});
