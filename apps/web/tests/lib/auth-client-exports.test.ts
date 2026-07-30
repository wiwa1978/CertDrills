import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function readPackageSource(path: string) {
  try {
    return await readFile(join(process.cwd(), "../../packages/auth-client/src", path), "utf8");
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

describe("web auth client exports", () => {
  it("does not expose admin auth plugin helpers", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_APP_NAME = "Test App";

    const authExports = await import("../../src/lib/auth-client");

    expect(Object.prototype.hasOwnProperty.call(authExports, "admin")).toBe(false);
  });

  it("imports the user-only auth client subpath", async () => {
    const appAuthClientSource = await readFile(join(process.cwd(), "src/lib/auth-client.ts"), "utf8");

    expect(appAuthClientSource).toContain('from "@platform/auth-client/web-user"');
    expect(appAuthClientSource).not.toContain('from "@platform/auth-client"');
  });

  it("keeps the public web package module free of admin auth surface", async () => {
    const userModuleSource = await readPackageSource("web-user.ts");

    expect(userModuleSource).not.toBeNull();
    expect(userModuleSource).not.toContain("adminClient");
    expect(userModuleSource).not.toContain("createWebAdminAuthClient");
    expect(userModuleSource).not.toContain("createWebAuthClient = createWebAdminAuthClient");
  });
});
