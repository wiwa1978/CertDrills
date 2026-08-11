import { describe, expect, it, vi } from "vitest";
import * as authExports from "../../src/lib/auth-client";

const mocks = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3001";
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:8787";
  process.env.NEXT_PUBLIC_APP_NAME = "Test Admin";
  return { options: null as null | Record<string, unknown> };
});

vi.mock("@platform/auth-client/web-admin", () => ({
  createWebAdminAuthClient: (options: Record<string, unknown>) => {
    mocks.options = options;
    return { admin: {}, twoFactor: {} };
  },
}));


describe("admin auth client", () => {
  it("configures the isolated admin realm without billing", () => {
    expect(Object.prototype.hasOwnProperty.call(authExports, "admin")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(authExports, "twoFactor")).toBe(true);
    expect(mocks.options).toMatchObject({
      baseURL: "http://localhost:8787/admin-auth",
      features: { billing: false },
    });
  });
});
