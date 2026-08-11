import type {
  CapabilityDefinition,
  ModuleDatabaseContribution,
  ModuleHealthCheck,
  PlatformApiModule,
  PlatformOpenApiOperation,
  PlatformRouteContribution,
  PrivacyContribution,
} from "@platform/module-contracts";
import type { InngestFunction } from "inngest";

export type PlatformModuleRegistry = {
  modules: readonly PlatformApiModule[];
  routes: readonly PlatformRouteContribution[];
  openApiRoutes: readonly PlatformOpenApiOperation[];
  inngestFunctions: readonly InngestFunction.Any[];
  privacy: ReadonlyMap<string, PrivacyContribution>;
  capabilities: ReadonlyMap<string, CapabilityDefinition>;
  resolveCapabilities(userId: string): Promise<readonly string[]>;
  database: ReadonlyMap<string, ModuleDatabaseContribution>;
  healthChecks: readonly ModuleHealthCheck[];
};

const reservedMountPaths = [
  "/auth", "/admin-auth", "/api/inngest", "/health", "/ready", "/session", "/me",
  "/payments", "/billing", "/logs", "/countries", "/docs", "/openapi.json", "/api/docs",
  "/api/openapi.json", "/admin/me", "/admin/payments", "/admin/billing", "/admin/users",
  "/admin/operations", "/admin/webhooks", "/admin/logs", "/admin/notifications", "/admin/discounts",
  "/admin/vouchers", "/admin/system", "/admin/dashboard",
] as const;

function ensureUnique(values: readonly string[], label: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function validateRoute(route: PlatformRouteContribution) {
  if (route.mountPath === "/" || route.mountPath.endsWith("/")) {
    throw new Error(`Module route ${route.id} must use a non-root mount path without a trailing slash`);
  }
  const reservedPath = reservedMountPaths.find((path) => (
    route.mountPath === path || route.mountPath.startsWith(`${path}/`)
  ));
  if (reservedPath) {
    throw new Error(`Module route ${route.id} conflicts with reserved path ${reservedPath}`);
  }
  if (route.access === "admin" && !route.mountPath.startsWith("/admin/")) {
    throw new Error(`Admin module route ${route.id} must mount below /admin`);
  }
  if (route.access !== "admin" && route.mountPath.startsWith("/admin/")) {
    throw new Error(`Non-admin module route ${route.id} cannot mount below /admin`);
  }
  if (route.access === "service" && !route.middleware?.length) {
    throw new Error(`Service module route ${route.id} must provide authentication middleware`);
  }
  for (const guardrail of route.guardrails ?? []) {
    if (!guardrail.path.source.startsWith("^\\/")) {
      throw new Error(`Guardrail pattern for ${route.id} must be anchored to an absolute path`);
    }
    if (guardrail.path.global || guardrail.path.sticky) {
      throw new Error(`Guardrail pattern for ${route.id} cannot use stateful flags`);
    }
  }
}

export function createPlatformModuleRegistry(modules: readonly PlatformApiModule[]): PlatformModuleRegistry {
  ensureUnique(modules.map((module) => module.id), "module id");

  const routes = modules.flatMap((module) => module.routes ?? []);
  routes.forEach(validateRoute);
  ensureUnique(routes.map((route) => route.id), "module route id");
  ensureUnique(routes.map((route) => route.mountPath), "module route mount path");

  const openApiRoutes = modules.flatMap((module) => module.openApiRoutes ?? []);
  ensureUnique(openApiRoutes.map((route) => `${route.method}:${route.path}`), "module OpenAPI operation");

  const inngestFunctions = modules.flatMap((module) => module.inngestFunctions ?? []);
  ensureUnique(inngestFunctions.map((fn) => fn.id()), "module Inngest function id");

  const capabilityEntries = modules.flatMap((module) => module.capabilities?.map((definition) => [definition.key, definition] as const) ?? []);
  ensureUnique(capabilityEntries.map(([key]) => key), "capability key");
  const capabilities = new Map(capabilityEntries);
  for (const route of routes) {
    if (route.requiredCapability && !capabilities.has(route.requiredCapability)) {
      throw new Error(`Module route ${route.id} requires unknown capability ${route.requiredCapability}`);
    }
    if (route.requiredCapability && route.access !== "user" && route.access !== "admin") {
      throw new Error(`Capability-gated module route ${route.id} must use user or admin access`);
    }
  }

  async function resolveCapabilities(userId: string) {
    const defaults = capabilityEntries
      .filter(([, definition]) => definition.defaultAccess === "allowed")
      .map(([key]) => key);
    const resolved = (await Promise.all(modules.map((module) => module.resolveCapabilities?.(userId) ?? []))).flat();
    const keys = [...new Set([...defaults, ...resolved])];
    for (const key of keys) {
      if (!capabilities.has(key)) throw new Error(`Capability resolver returned unknown capability ${key}`);
    }
    return keys;
  }

  const privacyEntries = modules.flatMap((module) => module.privacy ? [[module.id, module.privacy] as const] : []);
  const healthChecks = modules.flatMap((module) => module.healthChecks ?? []);
  ensureUnique(healthChecks.map((check) => check.id), "module health check id");
  const databaseEntries = modules.flatMap((module) => module.database ? [[module.id, module.database] as const] : []);
  ensureUnique(databaseEntries.map(([, database]) => database.migrationNamespace), "module migration namespace");
  ensureUnique(databaseEntries.flatMap(([, database]) => database.tablePrefixes), "module table prefix");
  ensureUnique(databaseEntries.flatMap(([, database]) => Object.keys(database.schema ?? {})), "module database schema export");

  return {
    modules,
    routes,
    openApiRoutes,
    inngestFunctions,
    privacy: new Map(privacyEntries),
    capabilities,
    resolveCapabilities,
    healthChecks,
    database: new Map(databaseEntries),
  };
}
