import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import type { PlatformApiModule } from "@platform/module-contracts";
import { composePlatformSchema, user } from "@platform/platform-db";

import { createPlatformModuleRegistry } from "../../src/composition/modules";
import { createProductApiModules, productDefinition } from "../../src/composition/product";

function moduleWithRoute(overrides: Partial<NonNullable<PlatformApiModule["routes"]>[number]> = {}): PlatformApiModule {
  return {
    id: "catalog",
    routes: [{
      id: "catalog-api",
      mountPath: "/catalog",
      access: "public",
      router: new Hono(),
      ...overrides,
    }],
  };
}

describe("createPlatformModuleRegistry", () => {
  it("supports a platform with no product modules", async () => {
    const registry = createPlatformModuleRegistry([]);

    expect(registry.routes).toEqual([]);
    expect(registry.openApiRoutes).toEqual([]);
    expect(registry.inngestFunctions).toEqual([]);
    expect(registry.privacy.size).toBe(0);
    expect(registry.database.size).toBe(0);
    await expect(registry.resolveCapabilities("user-1")).resolves.toEqual([]);
  });

  it("aggregates every supported module contribution", () => {
    const job = { id: () => "catalog-sync" } as never;
    const privacy = { exportUserData: vi.fn() };
    const healthCheck = { id: "catalog-database", required: true, check: vi.fn() };
    const module: PlatformApiModule = {
      ...moduleWithRoute(),
      openApiRoutes: [{ method: "get", path: "/catalog", operation: { responses: {} } }],
      inngestFunctions: [job],
      privacy,
      capabilities: [{ key: "catalog.read", defaultAccess: "allowed" }],
      healthChecks: [healthCheck],
      database: { migrationNamespace: "catalog", tablePrefixes: ["catalog_"] },
    };

    const registry = createPlatformModuleRegistry([module]);

    expect(registry.routes).toHaveLength(1);
    expect(registry.openApiRoutes).toHaveLength(1);
    expect(registry.inngestFunctions).toEqual([job]);
    expect(registry.privacy.get("catalog")).toBe(privacy);
    expect(registry.capabilities.get("catalog.read")).toEqual(module.capabilities?.[0]);
    expect(registry.healthChecks).toEqual([healthCheck]);
    expect(registry.database.get("catalog")).toEqual(module.database);
  });

  it("combines default and user-specific capabilities", async () => {
    const registry = createPlatformModuleRegistry([{
      id: "catalog",
      capabilities: [
        { key: "catalog.read", defaultAccess: "allowed" },
        { key: "catalog.export", defaultAccess: "denied" },
      ],
      resolveCapabilities: vi.fn(async (userId: string) => userId === "member" ? ["catalog.export"] : []),
    }]);

    await expect(registry.resolveCapabilities("member")).resolves.toEqual([
      "catalog.read",
      "catalog.export",
    ]);
  });

  it("rejects routes gated by undeclared capabilities", () => {
    expect(() => createPlatformModuleRegistry([moduleWithRoute({
      access: "user",
      requiredCapability: "catalog.read",
    })])).toThrow("requires unknown capability catalog.read");
  });

  it("rejects collisions below platform-owned paths", () => {
    expect(() => createPlatformModuleRegistry([
      moduleWithRoute({ mountPath: "/auth/product" }),
    ])).toThrow("conflicts with reserved path /auth");
  });

  it("rejects duplicate module routes", () => {
    expect(() => createPlatformModuleRegistry([
      moduleWithRoute(),
      { ...moduleWithRoute({ id: "other-route", mountPath: "/other" }), id: "other" },
    ].map((module, index) => index === 1
      ? { ...module, routes: [{ ...module.routes![0], mountPath: "/catalog" }] }
      : module))).toThrow("Duplicate module route mount path: /catalog");
  });

  it("rejects duplicate product table prefixes", () => {
    expect(() => createPlatformModuleRegistry([
      { id: "catalog", database: { migrationNamespace: "catalog", tablePrefixes: ["product_"] } },
      { id: "reports", database: { migrationNamespace: "reports", tablePrefixes: ["product_"] } },
    ])).toThrow("Duplicate module table prefix: product_");
  });

  it("rejects duplicate module schema exports", () => {
    expect(() => createPlatformModuleRegistry([
      { id: "catalog", database: { migrationNamespace: "catalog", tablePrefixes: ["catalog_"], schema: { catalogItems: {} } } },
      { id: "reports", database: { migrationNamespace: "reports", tablePrefixes: ["reports_"], schema: { catalogItems: {} } } },
    ])).toThrow("Duplicate module database schema export: catalogItems");
  });

  it("composes product tables without allowing platform schema collisions", () => {
    const catalogItems = { tableName: "catalog_items" };
    expect(composePlatformSchema({ catalogItems })).toMatchObject({ user, catalogItems });
    expect(() => composePlatformSchema({ user: {} })).toThrow("Duplicate database schema export: user");
  });

  it("requires explicit authentication middleware for service routes", () => {
    expect(() => createPlatformModuleRegistry([
      moduleWithRoute({ access: "service" }),
    ])).toThrow("must provide authentication middleware");
  });

  it("requires admin contributions below the admin prefix", () => {
    expect(() => createPlatformModuleRegistry([
      moduleWithRoute({ access: "admin" }),
    ])).toThrow("must mount below /admin");
  });

  it("composes product billing and CertDrill modules", () => {
    const capabilityService = { resolveForUser: vi.fn(async () => []) };
    const inngest = {
      createFunction: vi.fn((options: { id: string }) => ({ id: () => options.id })),
    };
    const modules = createProductApiModules({ db: {} as never, capabilityService, inngest: inngest as never });

    expect(modules.map((module) => module.id)).toEqual(["product-billing", "certdrill"]);
    expect(modules.find((module) => module.id === "certdrill")?.routes?.map((route) => route.mountPath))
      .toEqual(["/api/certdrill", "/admin/certdrill"]);
    expect(productDefinition.capabilities.filter((capability) => capability.consumption === "entitlement")).toEqual([
      {
        key: "starterContent.access",
        defaultAccess: "denied",
        consumption: "entitlement",
        grants: { transactionProducts: ["starterContent"] },
      },
      {
        key: "premiumContent.access",
        defaultAccess: "denied",
        consumption: "entitlement",
        grants: { transactionProducts: ["premiumContent"] },
      },
    ]);
  });
});
