import { Hono, type MiddlewareHandler } from "hono";
import { requestId } from "hono/request-id";

import type { PlatformRouteContribution } from "@platform/module-contracts";

import { createPlatformServices, type PlatformServices } from "./bootstrap";
import { createPlatformModuleRegistry } from "./composition/modules";
import { createProductApiModules, productDefinition } from "./composition/product";
import type { AppEnv } from "./context";
import { env } from "./env";
import { inngest } from "./inngest/client";
import { corsMiddleware } from "./middleware/cors";
import { errorHandler } from "./middleware/error-handler";
import { originGuard } from "./middleware/origin-guard";
import { createApiKeyOrSessionAuth } from "./middleware/api-key-auth";
import { createRequestGuardrails } from "./middleware/request-guardrails";
import { requestLogger } from "./middleware/request-logger";
import { securityHeaders } from "./middleware/security-headers";
import { isImpersonatedSession } from "./modules/admin/governance";
import { runWithBetterAuthWebhookContext } from "./modules/payments/better-auth-webhook-context";
import { APP_OWNED_API_ROUTES } from "./openapi";
import { createAdminRouter } from "./routes/admin";
import { createAuthRouter } from "./routes/auth";
import { createDocsRouter } from "./routes/docs";
import { createInngestHandler } from "./routes/inngest";
import { createLogsRouter } from "./routes/logs";
import { createMeRouter } from "./routes/me";
import { createCheckoutRouter, createPaymentsRouter } from "./routes/payments";
import { createSystemRouter } from "./routes/system";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function clearSessionCookieHeader(cookiePrefix: "better-auth" | "better-auth-admin") {
  const secure = env.NODE_ENV === "production";
  const parts = [
    `${secure ? "__Secure-" : ""}${cookiePrefix}.session_token=`,
    "Path=/",
    "HttpOnly",
    "Max-Age=0",
    `SameSite=${env.COOKIE_SAMESITE}`,
  ];

  if (env.COOKIE_DOMAIN) parts.push(`Domain=${env.COOKIE_DOMAIN}`);
  if (secure) parts.push("Secure");

  return parts.join("; ");
}

function mountProductRoute(
  app: Hono<AppEnv>,
  route: PlatformRouteContribution,
  userAuth: MiddlewareHandler<AppEnv>,
  resolveCapabilities: (userId: string) => Promise<readonly string[]>,
) {
  const routePattern = `${route.mountPath}/*`;
  app.use(routePattern, async (c, next) => {
    c.set("moduleId", route.id);
    return next();
  });
  if (route.access === "user") {
    app.use(routePattern, userAuth);
  }
  if (route.requiredCapability) {
    app.use(routePattern, async (c, next) => {
      const userId = c.get("authUser")?.id;
      if (!userId || !(await resolveCapabilities(userId)).includes(route.requiredCapability!)) {
        return c.json({ success: false, error: { code: "FORBIDDEN", message: "Capability not granted" } }, 403);
      }
      return next();
    });
  }

  for (const middleware of route.middleware ?? []) {
    app.use(routePattern, middleware as MiddlewareHandler<AppEnv>);
  }
  app.route(route.mountPath, route.router);
}

export function createPlatformApp(services: PlatformServices, modules = createProductApiModules({
  db: services.db,
  capabilityService: services.capabilityService,
  inngest,
  certdrillFoundry: certDrillFoundryConfig(),
})) {
  const registry = createPlatformModuleRegistry(modules);
  const platformOpenApiOperations = new Set(APP_OWNED_API_ROUTES.map((route) => `${route.method}:${route.path}`));
  for (const route of registry.openApiRoutes) {
    if (platformOpenApiOperations.has(`${route.method}:${route.path}`)) {
      throw new Error(`Product OpenAPI operation conflicts with platform route: ${route.method.toUpperCase()} ${route.path}`);
    }
  }
  services.productLifecycle.setPrivacyContributions(registry.privacy);
  const app = new Hono<AppEnv>();
  const adminApplicationUrl = env.ADMIN_APP_URL;
  if (!adminApplicationUrl) throw new Error("ADMIN_APP_URL is required for admin routes");

  const requestGuardrails = createRequestGuardrails({
    rateLimitStore: services.rateLimitStore,
    trustProxy: env.TRUST_PROXY,
    trustedProxyHops: env.TRUSTED_PROXY_HOPS,
    additionalGuardrails: registry.routes.flatMap((route) => route.guardrails ?? []),
  });

  const apiKeyOrSessionAuth = createApiKeyOrSessionAuth({
    db: services.db,
    apiKeysService: services.apiKeysService,
    sessionAuth: services.authModule.requireAuth,
  });

  const blockImpersonatedAdminMutations: MiddlewareHandler<AppEnv> = async (c, next) => {
    if (!unsafeMethods.has(c.req.method) || !isImpersonatedSession(c.get("authSession"))) {
      return next();
    }

    return c.json({ success: false, error: { code: "FORBIDDEN", message: "Admin actions are blocked while impersonating another user." } }, 403);
  };

  app.use("/*", requestId());
  app.use("/*", corsMiddleware);
  app.use("/*", originGuard);
  app.use("/*", requestGuardrails);
  app.use("/*", requestLogger);
  app.use("/*", securityHeaders);
  app.onError(errorHandler);

  app.on(
    ["GET", "PUT", "POST"],
    "/api/inngest",
    createInngestHandler([...services.inngestFunctions, ...registry.inngestFunctions]),
  );

  app.route("/admin-auth", createAuthRouter(services, services.adminAuthModule));
  app.use("/admin-auth/admin/*", async (c, next) => {
    await next();
    if (c.res.status === 403) {
      c.res.headers.append("Set-Cookie", clearSessionCookieHeader("better-auth-admin"));
    }
  });
  app.use("/admin-auth/admin/*", services.adminAuthModule.requireAuth);
  app.use("/admin-auth/admin/*", services.adminAuthModule.requireAdminAccess);
  app.use("/admin-auth/admin/*", blockImpersonatedAdminMutations);
  app.use("/auth/admin/*", services.authModule.requireAuth);
  app.use("/auth/admin/*", services.authModule.requireAdminAccess);
  app.use("/auth/admin/*", async (c, next) => {
    await next();
    if (c.res.status === 403) {
      c.res.headers.append("Set-Cookie", clearSessionCookieHeader("better-auth"));
    }
  });
  app.use("/auth/dodopayments/webhooks", async (c, next) => {
    await runWithBetterAuthWebhookContext(c.req.raw.headers, c.get("requestId") ?? null, next);
  });

  app.route("/auth", services.authModule.router);
  app.route("/admin-auth", services.adminAuthModule.router);
  app.route("/session", services.authModule.sessionRouter);
  app.route("/auth/mobile", services.authModule.mobileRouter);
  app.route("/", createSystemRouter(services, registry.healthChecks));
  app.route("/", createLogsRouter());
  app.route("/", createPaymentsRouter(services));
  app.route("/me", createMeRouter(services, {
    requireAuth: apiKeyOrSessionAuth,
    resolveCapabilities: registry.resolveCapabilities,
  }));
  app.use("/admin/*", services.adminAuthModule.requireAuth);
  app.use("/admin/*", services.adminAuthModule.requireAdminAccess);
  app.use("/admin/*", blockImpersonatedAdminMutations);
  app.route("/admin/me", createMeRouter(services, {
    requireAuth: false,
    resolveCapabilities: registry.resolveCapabilities,
  }));
  app.route("/admin", createCheckoutRouter(services, {
    requireAuth: false,
    applicationUrl: adminApplicationUrl,
  }));
  app.route("/admin", createAdminRouter(services));

  for (const route of registry.routes) {
    mountProductRoute(app, route, apiKeyOrSessionAuth, registry.resolveCapabilities);
  }

  app.route("/", createDocsRouter(services, registry.openApiRoutes));
  return app;
}
function certDrillFoundryConfig() {
  if (!env.AZURE_AI_FOUNDRY_PROJECT_ENDPOINT || !env.AZURE_AI_FOUNDRY_API_KEY || !env.AZURE_AI_FOUNDRY_MODEL) {
    return undefined;
  }

  return {
    projectEndpoint: env.AZURE_AI_FOUNDRY_PROJECT_ENDPOINT,
    apiKey: env.AZURE_AI_FOUNDRY_API_KEY,
    model: env.AZURE_AI_FOUNDRY_MODEL,
    timeoutMs: env.AZURE_AI_FOUNDRY_TIMEOUT_MS,
  };
}

export const services = createPlatformServices(productDefinition);
export const app = createPlatformApp(services);
