import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("admin auth client exports", () => {
  it("keeps admin auth plugin helpers available", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3001";
    process.env.NEXT_PUBLIC_APP_NAME = "Test Admin";

    const authExports = await import("../../src/lib/auth-client");

    expect(Object.prototype.hasOwnProperty.call(authExports, "admin")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(authExports, "twoFactor")).toBe(true);
  });

  it("imports the admin-capable auth client subpath", async () => {
    const appAuthClientSource = await readFile(join(process.cwd(), "src/lib/auth-client.ts"), "utf8");

    expect(appAuthClientSource).toContain('from "@platform/auth-client/web-admin"');
  });
});
