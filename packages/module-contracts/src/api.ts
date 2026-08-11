import type { Hono, MiddlewareHandler } from "hono";
import type { InngestFunction } from "inngest";

export type ModuleAccessPolicy = "public" | "user" | "admin" | "service";

export type ModuleRateLimitRule = {
  windowMs: number;
  max: number;
};

export type ModuleRouteGuardrail = {
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  path: RegExp;
  maxBodyBytes?: number;
  rateLimit?: ModuleRateLimitRule;
};

export type PlatformRouteContribution = {
  id: string;
  mountPath: `/${string}`;
  access: ModuleAccessPolicy;
  requiredCapability?: CapabilityKey;
  router: Hono<any>;
  middleware?: readonly MiddlewareHandler[];
  guardrails?: readonly ModuleRouteGuardrail[];
};

export type PlatformOpenApiOperation = {
  method: "get" | "post" | "patch" | "put" | "delete";
  path: `/${string}`;
  operation: Record<string, unknown>;
};

export type CapabilityKey = string;

export type CapabilityDefinition = {
  key: CapabilityKey;
  defaultAccess: "allowed" | "denied";
  grants?: {
    plans?: readonly string[];
    transactionProducts?: readonly string[];
  };
  consumption?: "none" | "credits" | "entitlement";
  creditCost?: number;
};

export type PrivacyContribution = {
  exportUserData(userId: string): Promise<unknown>;
  deleteUserData?(userId: string): Promise<void>;
};

export type ModuleHealthResult = {
  status: "ready" | "degraded" | "not_ready";
  detail?: string;
};

export type ModuleHealthCheck = {
  id: string;
  required: boolean;
  check(): Promise<ModuleHealthResult>;
};

export type ModuleDatabaseContribution = {
  migrationNamespace: string;
  tablePrefixes: readonly `${string}_`[];
  schema?: Readonly<Record<string, unknown>>;
};

export type PlatformApiModule = {
  id: string;
  routes?: readonly PlatformRouteContribution[];
  openApiRoutes?: readonly PlatformOpenApiOperation[];
  inngestFunctions?: readonly InngestFunction.Any[];
  privacy?: PrivacyContribution;
  capabilities?: readonly CapabilityDefinition[];
  resolveCapabilities?(userId: string): Promise<readonly CapabilityKey[]>;
  healthChecks?: readonly ModuleHealthCheck[];
  database?: ModuleDatabaseContribution;
};
