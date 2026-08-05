import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const billingService = {
    getCreditBalance: vi.fn(),
    getCreditHistory: vi.fn(),
    getCreditPurchases: vi.fn(),
    downloadInvoice: vi.fn(),
    getLatestProviderCustomerId: vi.fn(),
    getLatestDodoCustomerId: vi.fn(),
    processCreditPurchase: vi.fn(),
    createCreditRefund: vi.fn(),
    getUserByEmail: vi.fn(),
    consumeCredits: vi.fn(),
  };
  const checkoutIntentsService = {
    create: vi.fn(async () => ({ referenceId: "checkout-ref-functional" })),
    findByReferenceId: vi.fn(),
    markPending: vi.fn(),
    markCompleted: vi.fn(),
    markFailed: vi.fn(),
  };

  const subscriptionService = {
    getUserSubscription: vi.fn(),
    listSubscriptions: vi.fn(),
    listSubscriptionPayments: vi.fn(),
    getSubscriptionStats: vi.fn(),
    getPlanDistribution: vi.fn(),
    listSubscriptionEvents: vi.fn(),
    createSubscriptionRefund: vi.fn(),
    getSubscriptionFinanceSummary: vi.fn(),
    listUserSubscriptionPayments: vi.fn(),
    downloadSubscriptionInvoice: vi.fn(),
    getLatestProviderCustomerId: vi.fn(),
    getLatestDodoCustomerId: vi.fn(),
    recordSubscriptionPayment: vi.fn(),
    upsertUserSubscription: vi.fn(),
    recordSubscriptionEvent: vi.fn(),
  };

  const adminService = {
    verifyAdminSecret: vi.fn(),
    getDashboardStats: vi.fn(),
    getUsers: vi.fn(),
    getUserStats: vi.fn(),
    getUserById: vi.fn(),
    getUserCreditBalance: vi.fn(),
    getUserCreditHistory: vi.fn(),
    getUserCreditPurchases: vi.fn(),
    getBillingStats: vi.fn(),
    getRevenueData: vi.fn(),
    getAllTransactions: vi.fn(),
    getAllPurchases: vi.fn(),
    getTransactionData: vi.fn(),
    getCreditsConsumedData: vi.fn(),
    searchUsers: vi.fn(),
    countActiveAdmins: vi.fn(),
  };

  const adminCreditsDashboardService = {
    getDashboard: vi.fn(),
  };

  const notificationsService = {
    listForUser: vi.fn(),
    unreadCount: vi.fn(),
    markAsRead: vi.fn(),
    deleteNotification: vi.fn(),
    markAllAsRead: vi.fn(),
    getActiveBannerForUser: vi.fn(),
    getAllNotifications: vi.fn(),
    sendNotificationToAllUsers: vi.fn(),
    sendNotificationToUsers: vi.fn(),
    createNotification: vi.fn(),
  };

  const discountsService = {
    getDiscounts: vi.fn(),
    getDiscountById: vi.fn(),
    generateDiscountCode: vi.fn(),
    validateDiscountCode: vi.fn(),
    createDiscount: vi.fn(),
    updateDiscount: vi.fn(),
    deleteDiscount: vi.fn(),
    assignDiscountToUsers: vi.fn(),
    removeDiscountFromUsers: vi.fn(),
    searchUsersForDiscount: vi.fn(),
  };

  const vouchersService = {
    getVouchers: vi.fn(),
    getVoucherById: vi.fn(),
    createVoucher: vi.fn(),
    updateVoucher: vi.fn(),
    searchUsers: vi.fn(),
    redeemVoucher: vi.fn(),
  };
  const dodoCustomerPortal = {
    create: vi.fn(),
  };
  const auditService = {
    recordAuditEntry: vi.fn(),
    listAuditEntries: vi.fn(),
  };
  const adminAuthApi = {
    setRole: vi.fn(),
    banUser: vi.fn(),
    unbanUser: vi.fn(),
    impersonateUser: vi.fn(),
    revokeUserSessions: vi.fn(),
    setUserPassword: vi.fn(),
    stopImpersonating: vi.fn(),
    generateOpenAPISchema: vi.fn(async () => ({
      openapi: "3.1.0",
      paths: {
        "/auth/sign-in/email": {
          post: {
            summary: "Sign in with email and password",
            responses: { "200": { description: "Signed in" } },
          },
        },
      },
      components: {},
    })),
    getSession: vi.fn(async () => ({ user: { twoFactorEnabled: true } })),
    verifyTotp: vi.fn(async () => null),
  };
  const countries = [
    { id: "country-be-nl", name: "Belgie", code: "BE", language: "nl" },
    { id: "country-be-en", name: "Belgium", code: "BE", language: "en" },
  ];
  const webhookRows = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      provider: "dodo",
      providerEventId: "evt_123",
      eventType: "payment.succeeded",
      paymentId: "pay_123",
      signatureTimestamp: new Date("2026-04-28T09:00:00.000Z"),
      processingStatus: "processed",
      errorDetails: null,
      processedAt: new Date("2026-04-28T09:00:03.000Z"),
      failedAt: null,
      createdAt: new Date("2026-04-28T09:00:00.000Z"),
      updatedAt: new Date("2026-04-28T09:00:03.000Z"),
    },
  ];
  const webhookStatsRows = [
    { processingStatus: "processed", count: 1 },
    { processingStatus: "failed", count: 2 },
  ];
  const db = {
    query: {
      paymentWebhookEvents: {
        findMany: vi.fn(async () => webhookRows),
        findFirst: vi.fn(async () => webhookRows[0]),
      },
    },
    select: vi.fn((selection?: Record<string, unknown>) => {
      let selectedLanguage = "en";
      const builder = {
        from: vi.fn(() => builder),
        where: vi.fn((condition?: { value?: string }) => {
          selectedLanguage = condition?.value ?? "en";
          if (selection && "count" in selection) return [{ count: webhookRows.length }];
          return builder;
        }),
        groupBy: vi.fn(() => webhookStatsRows),
        limit: vi.fn(() => builder),
        offset: vi.fn(() => builder),
        orderBy: vi.fn(() => {
          if (selection && "count" in selection) return [{ count: webhookRows.length }];
          return countries.filter((country) => country.language === selectedLanguage);
        }),
      };
      return builder;
    }),
  };
  return {
    billingService,
    checkoutIntentsService,
    subscriptionService,
    adminService,
    adminCreditsDashboardService,
    notificationsService,
    discountsService,
    vouchersService,
    auditService,
    adminAuthApi,
    dodoCustomerPortal,
    db,
    env: {
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/test",
      APP_URL: "http://localhost:3200",
      API_URL: "http://localhost:8877",
      ADMIN_ALLOWLIST: "admin@example.com",
      LOG_LEVEL: "info" as const,
      DODO_PAYMENTS_ENVIRONMENT: "test_mode" as const,
      DODO_PAYMENTS_API_KEY: "dodo-api-key",
      BETTER_AUTH_SECRET: "this-is-a-long-enough-secret",
      JWT_SECRET: "this-is-a-long-enough-jwt-secret",
      JWT_ISSUER: "api",
      JWT_AUDIENCE: "mobile-clients",
      JWT_ACCESS_TTL_SECONDS: 900,
      JWT_REFRESH_TTL_SECONDS: 2592000,
    },
  };
});

vi.mock("../src/env", () => ({ env: mocks.env }));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions) => ({ type: "and", conditions })),
  asc: vi.fn((column) => column),
  count: vi.fn(() => ({ type: "count" })),
  desc: vi.fn((column) => column),
  eq: vi.fn((column, value) => ({ column, value })),
  gte: vi.fn((column, value) => ({ column, value, op: "gte" })),
  ilike: vi.fn((column, value) => ({ column, value, op: "ilike" })),
  lte: vi.fn((column, value) => ({ column, value, op: "lte" })),
  or: vi.fn((...conditions) => ({ type: "or", conditions })),
}));

vi.mock("../src/modules/billing/service", () => ({
  createBillingService: () => mocks.billingService,
}));

vi.mock("../src/modules/billing/checkout-intents", () => ({
  createCheckoutIntentsService: () => mocks.checkoutIntentsService,
}));

vi.mock("../src/modules/billing/subscription-service", () => ({
  createSubscriptionService: () => mocks.subscriptionService,
  normalizeSubscriptionStatus: vi.fn((status: string) => (status === "cancelled" ? "canceled" : status)),
}));

vi.mock("../src/modules/admin/service", () => ({
  createAdminService: () => mocks.adminService,
}));

vi.mock("../src/modules/billing/credits-dashboard-service", () => ({
  createAdminCreditsDashboardService: () => mocks.adminCreditsDashboardService,
}));

vi.mock("../src/modules/notifications/service", () => ({
  createNotificationsService: () => mocks.notificationsService,
}));

vi.mock("../src/modules/discounts/service", () => ({
  createDiscountsService: () => mocks.discountsService,
}));

vi.mock("../src/modules/vouchers/service", () => ({
  createVouchersService: () => mocks.vouchersService,
}));

vi.mock("../src/modules/audit/service", () => ({
  createAuditService: () => mocks.auditService,
  getAuditRequestContext: () => ({
    actorId: "auth-user",
    requestId: "req-test",
    ip: "127.0.0.1",
    userAgent: "vitest",
  }),
}));

vi.mock("@platform/auth-core", () => ({
  authAdditionalUserFields: {},
  createAuthModule: () => {
    const router = new Hono();
    router.post("/sign-in/email", async (c) => {
      const body = (await c.req.json().catch(() => null)) as { email?: string; password?: string } | null;
      if (!body?.email || !body?.password) {
        return c.json({ success: false, error: "Invalid credentials" }, 401);
      }
      return c.json({ success: true, data: { token: "session-token" } });
    });

    const mobileRouter = new Hono();
    mobileRouter.post("/token", async (c) => {
      const body = (await c.req.json().catch(() => null)) as { email?: string; password?: string } | null;
      if (!body?.email || !body?.password) {
        return c.json({ success: false, error: "Invalid credentials" }, 401);
      }
      return c.json({ success: true, data: { accessToken: "a", refreshToken: "r" } });
    });
    mobileRouter.post("/refresh", async (c) => {
      const body = (await c.req.json().catch(() => null)) as { refreshToken?: string } | null;
      if (body?.refreshToken !== "refresh-good") {
        return c.json({ success: false, error: "Invalid refresh token" }, 401);
      }
      return c.json({ success: true, data: { accessToken: "a2", refreshToken: "r2" } });
    });
    mobileRouter.post("/revoke", async (c) => {
      const body = (await c.req.json().catch(() => null)) as { refreshToken?: string } | null;
      if (body?.refreshToken !== "refresh-good") {
        return c.json({ success: false, error: "Invalid refresh token" }, 401);
      }
      return c.json({ success: true, data: { revoked: true } });
    });

    const passThrough = async (c: any, next: any) => {
      c.set("authUser", {
        id: c.req.header("x-test-auth-user-id") ?? "auth-user",
        role: "admin",
        email: c.req.header("x-test-auth-user-email") ?? "admin@example.com",
      });
      const impersonatedBy = c.req.header("x-test-impersonated-by");
      c.set("authSession", impersonatedBy ? { impersonatedBy } : null);
      await next();
    };

    return {
      router,
      sessionRouter: new Hono(),
      mobileRouter,
      auth: { api: mocks.adminAuthApi },
      requireAuth: passThrough,
      requireAdmin: passThrough,
      requireAdminAccess: passThrough,
    };
  },
}));

vi.mock("@platform/payments-core", () => ({
  createPaymentsModule: () => {
    const router = new Hono();
    router.post("/webhooks/:provider", async (c) => {
      if (c.req.param("provider") !== "dodo") {
        return c.json({ success: false, error: { code: "NOT_FOUND", message: "Unsupported payment provider" } }, 404);
      }

      if (c.req.header("x-dodo-signature") !== "valid") {
        return c.json({ success: false, error: { code: "WEBHOOK_SIGNATURE_INVALID", message: "Invalid signature" } }, 401);
      }
      return c.json({ success: true, data: { processed: true } });
    });
    return { router };
  },
}));

vi.mock("dodopayments", () => ({
  default: vi.fn(() => ({
    customers: {
      customerPortal: mocks.dodoCustomerPortal,
    },
  })),
}));

vi.mock("@platform/platform-db", () => ({
  createPlatformDb: () => ({ db: mocks.db }),
  account: {},
  auditEntries: {},
  checkoutIntents: {},
  creditPurchases: {},
  creditTransactions: {},
  mobileRefreshToken: {},
  notification: {},
  session: {},
  subscriptionPayments: {},
  user: {},
  userCredits: {},
  userDataExportRequests: {},
  userDiscounts: {},
  userSubscriptions: {},
  voucherAssignments: {},
  voucherRedemptions: {},
  country: {
    id: "id",
    name: "name",
    code: "code",
    language: "language",
  },
  paymentWebhookEvents: {
    id: "id",
    provider: "provider",
    providerEventId: "providerEventId",
    eventType: "eventType",
    paymentId: "paymentId",
    signatureTimestamp: "signatureTimestamp",
    processingStatus: "processingStatus",
    errorDetails: "errorDetails",
    processedAt: "processedAt",
    failedAt: "failedAt",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
}));

vi.mock("@platform/email-core", () => ({
  createEmailModule: () => ({ sendTemplate: vi.fn() }),
  createResendProvider: () => ({ send: vi.fn() }),
}));

const [
  { app },
  { bootstrap },
  { clearRequestGuardrailStateForTests },
  { API_VERSION_POLICY, APP_OWNED_API_ROUTES },
  { applicationConfig },
] = await Promise.all([
  import("../src/app"),
  import("../src/bootstrap"),
  import("../src/middleware/request-guardrails"),
  import("../src/openapi"),
  import("../src/config/application"),
]);

function setBillingModeForTest(mode: "credits" | "subscriptions") {
  (applicationConfig as { billing: { mode: "credits" | "subscriptions" } }).billing.mode = mode;
}

type RouteSignature = `${string} ${string}`;

function normalizeRoutePath(path: string) {
  return path.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, "{$1}");
}

function joinRoutePath(prefix: string, path: string) {
  const joined = `${prefix}${path}`.replace(/\/+/g, "/");
  return joined === "" ? "/" : normalizeRoutePath(joined);
}

function routeSignature(method: string, path: string): RouteSignature {
  return `${method.toUpperCase()} ${path}`;
}

async function expectValidationError(res: Response, error: string) {
  await expect(res.json()).resolves.toMatchObject({
    success: false,
    error: {
      code: "VALIDATION_FAILED",
      message: error,
    },
    requestId: expect.any(String),
  });
}

function expectApiError(message: string, code = "BAD_REQUEST") {
  return {
    success: false,
    error: {
      code,
      message,
    },
  };
}

function readRouteSource(fileName: string) {
  return readFileSync(new URL(`../src/routes/${fileName}`, import.meta.url), "utf8");
}

function extractRouterRoutes(fileName: string, prefix = "") {
  const source = readRouteSource(fileName);
  const routes: RouteSignature[] = [];
  const directRoutePattern = /router\.(get|post|patch|put|delete)\("([^"]+)"/g;
  const adminAuthActionPattern = /registerAdminAuth(?:Secret)?(?:Json|Response)Action\(\s*"([^"]+)"/g;

  for (const match of source.matchAll(directRoutePattern)) {
    const [, method, path] = match;
    routes.push(routeSignature(method, joinRoutePath(prefix, path)));
  }

  for (const match of source.matchAll(adminAuthActionPattern)) {
    const [, path] = match;
    routes.push(routeSignature("post", joinRoutePath(prefix, path)));
  }

  return routes;
}

function getSourceDefinedAppRoutes() {
  return [
    ...extractRouterRoutes("system.ts"),
    ...extractRouterRoutes("logs.ts"),
    ...extractRouterRoutes("payments.ts"),
    ...extractRouterRoutes("auth.ts", "/auth"),
    ...extractRouterRoutes("me.ts", "/me"),
    ...extractRouterRoutes("admin.ts", "/admin"),
    routeSignature("post", "/payments/webhooks/{provider}"),
    routeSignature("post", "/auth/mobile/token"),
    routeSignature("post", "/auth/mobile/refresh"),
    routeSignature("post", "/auth/mobile/revoke"),
    routeSignature("get", "/session/me"),
    routeSignature("get", "/session/admin/me"),
  ].sort();
}

describe("API functional routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setBillingModeForTest("credits");
    mocks.adminService.verifyAdminSecret.mockResolvedValue({ success: true });
    mocks.adminAuthApi.verifyTotp.mockResolvedValue(null);
    mocks.adminAuthApi.getSession.mockResolvedValue({ user: { twoFactorEnabled: true } });
    mocks.auditService.recordAuditEntry.mockResolvedValue({ success: true, entry: { id: "audit-1" } });
    mocks.auditService.listAuditEntries.mockResolvedValue([]);
    mocks.subscriptionService.getLatestProviderCustomerId.mockResolvedValue(null);
    clearRequestGuardrailStateForTests();
  });

  it("exports the audit service from bootstrap", () => {
    expect(bootstrap.auditService).toBe(mocks.auditService);
  });

  // Verifies the health endpoint always reports service readiness.
  it("returns health status", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { status: "ok" },
    });
  });

  // Verifies authenticated clients can discover application capabilities before
  // choosing credit-only or subscription-only API surfaces.
  it("returns application config for authenticated clients", async () => {
    const res = await app.request("/me/application-config");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: {
        billing: {
          enabled: true,
          mode: "credits",
          creditSurfacesEnabled: true,
          subscriptionSurfacesEnabled: false,
        },
        features: {
          vouchers: true,
          discounts: true,
          notifications: true,
        },
      },
    });
  });

  // Verifies validation errors produced by API helpers include machine-readable
  // metadata for generated clients while preserving the human-readable message.
  it("returns canonical validation error metadata", async () => {
    const res = await app.request("/countries?lang=de");
    expect(res.status).toBe(400);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(res.headers.get("x-error-code")).toBe("VALIDATION_FAILED");
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid countries query",
      },
      requestId: expect.any(String),
    });
  });

  // Verifies countries now use the same success envelope as other API routes.
  it("returns enveloped localized countries", async () => {
    const res = await app.request("/countries?lang=nl");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: [{ id: "country-be-nl", name: "Belgie", code: "BE", language: "nl" }],
    });
  });

  // Verifies that email sign-in rejects incomplete credentials with a 401.
  it("rejects email sign-in with missing credentials", async () => {
    const res = await app.request("/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "john@example.com" }),
    });
    expect(res.status).toBe(401);
  });

  // Verifies that email sign-in accepts valid credentials.
  it("accepts email sign-in with valid credentials", async () => {
    const res = await app.request("/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "john@example.com", password: "secret" }),
    });
    expect(res.status).toBe(200);
  });

  // Verifies mobile token exchange rejects invalid payloads.
  it("rejects mobile token request with invalid payload", async () => {
    const res = await app.request("/auth/mobile/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "john@example.com" }),
    });
    expect(res.status).toBe(401);
  });

  // Verifies mobile token exchange succeeds with valid credentials.
  it("issues mobile tokens with valid credentials", async () => {
    const res = await app.request("/auth/mobile/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "john@example.com", password: "secret" }),
    });
    expect(res.status).toBe(200);
  });

  // Verifies refresh token endpoint rejects invalid request bodies.
  it("rejects mobile refresh with invalid request body", async () => {
    const res = await app.request("/auth/mobile/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: "nope" }),
    });
    expect(res.status).toBe(401);
  });

  // Verifies refresh token endpoint rotates tokens for valid request body.
  it("refreshes mobile token with valid request body", async () => {
    const res = await app.request("/auth/mobile/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: "refresh-good" }),
    });
    expect(res.status).toBe(200);
  });

  // Verifies revoke endpoint requires a valid request body.
  it("rejects mobile revoke with invalid request body", async () => {
    const res = await app.request("/auth/mobile/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: "nope" }),
    });
    expect(res.status).toBe(401);
  });

  // Verifies revoke endpoint accepts a valid request body.
  it("revokes mobile token with valid request body", async () => {
    const res = await app.request("/auth/mobile/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: "refresh-good" }),
    });
    expect(res.status).toBe(200);
  });

  // Verifies webhook endpoint blocks requests with invalid signatures.
  it("rejects dodo webhook with invalid signature", async () => {
    const res = await app.request("/payments/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": "invalid" },
    });
    expect(res.status).toBe(401);
  });

  // Verifies webhook endpoint accepts signed requests.
  it("accepts dodo webhook with valid signature", async () => {
    const res = await app.request("/payments/webhooks/dodo", {
      method: "POST",
      headers: { "x-dodo-signature": "valid" },
    });
    expect(res.status).toBe(200);
  });

  it("rejects unsupported payment webhook providers", async () => {
    const res = await app.request("/payments/webhooks/stripe", {
      method: "POST",
      headers: { "x-dodo-signature": "valid" },
      body: "{}",
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual(expectApiError("Unsupported payment provider", "NOT_FOUND"));
  });

  // Verifies checkout endpoint rejects requests without packageKey.
  it("validates packageKey for checkout", async () => {
    const res = await app.request("/payments/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    await expectValidationError(res, "Invalid checkout payload");
  });

  // Verifies OpenAPI endpoints are equivalent and contain all declared contract paths.
  it("serves OpenAPI specs on both endpoints", async () => {
    const [rootRes, apiRes] = await Promise.all([
      app.request("/openapi.json"),
      app.request("/api/openapi.json"),
    ]);

    expect(rootRes.status).toBe(200);
    expect(apiRes.status).toBe(200);

    const rootSpec = await rootRes.json();
    const apiSpec = await apiRes.json();

    expect(rootSpec.openapi).toBe("3.1.0");
    expect(rootSpec.info?.title).toBe("SaaS Platform API");
    expect(rootSpec.servers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: "http://localhost:8877" }),
        expect.objectContaining({ url: `http://localhost:8877${API_VERSION_POLICY.nextStablePrefix}` }),
      ]),
    );
    expect(rootSpec.paths?.["/auth/sign-in/email"]?.post).toBeTruthy();
    expect(apiSpec).toEqual(rootSpec);

    for (const route of APP_OWNED_API_ROUTES) {
      const operation = rootSpec.paths?.[route.path]?.[route.method];
      expect(operation).toBeTruthy();
      expect(operation?.operationId).toBe(route.operation.operationId);
      expect(operation?.tags).toEqual(route.operation.tags);
      expect(operation?.responses?.["200"]).toBeTruthy();
    }

    const sendAllOperation = rootSpec.paths?.["/admin/notifications/send-all"]?.post;
    const sendUsersOperation = rootSpec.paths?.["/admin/notifications/send-users"]?.post;
    const adminUsersOperation = rootSpec.paths?.["/admin/users"]?.get;
    expect(adminUsersOperation?.parameters?.map((parameter: { name?: string }) => parameter.name)).toEqual([
      "limit",
      "offset",
      "search",
      "role",
    ]);
    expect(sendAllOperation?.requestBody?.content?.["application/json"]?.schema?.properties).toEqual(
      expect.objectContaining({ title: expect.anything(), message: expect.anything() }),
    );
    expect(sendUsersOperation?.requestBody?.content?.["application/json"]?.schema?.properties).toEqual(
      expect.objectContaining({ userIds: expect.anything(), title: expect.anything(), message: expect.anything() }),
    );
    expect(sendAllOperation?.responses?.["200"]?.content?.["application/json"]?.schema?.properties?.data?.properties).toEqual(
      expect.objectContaining({
        sentCount: expect.anything(),
        skippedCount: expect.anything(),
        invalidRecipientCount: expect.anything(),
        invalidRecipientIds: expect.anything(),
      }),
    );
    expect(sendAllOperation?.responses?.["200"]?.content?.["application/json"]?.schema?.properties?.data?.properties).not.toHaveProperty("batchId");
    expect(sendUsersOperation?.responses?.["200"]?.content?.["application/json"]?.schema?.properties?.data?.properties).toEqual(
      expect.objectContaining({
        sentCount: expect.anything(),
        skippedCount: expect.anything(),
        invalidRecipientCount: expect.anything(),
        invalidRecipientIds: expect.anything(),
      }),
    );
    expect(sendUsersOperation?.responses?.["200"]?.content?.["application/json"]?.schema?.properties?.data?.properties).not.toHaveProperty("batchId");

    const documentedAppRoutes = APP_OWNED_API_ROUTES.map((route) => `${route.method.toUpperCase()} ${route.path}`);
    expect(new Set(documentedAppRoutes).size).toBe(documentedAppRoutes.length);
    expect(documentedAppRoutes.sort()).toEqual(getSourceDefinedAppRoutes());
  });

  // Verifies admin dashboard endpoint returns delegated stats payload.
  it("returns admin dashboard stats", async () => {
    mocks.adminService.getDashboardStats.mockResolvedValueOnce({ totalUsers: 42 });
    const res = await app.request("/admin/dashboard/stats");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, data: { totalUsers: 42 } });
  });

  // Verifies admin dashboard endpoint returns delegated stats payload.
  it("returns admin dashboard stats for privileged admin console", async () => {
    mocks.adminService.getDashboardStats.mockResolvedValueOnce({ totalUsers: 99 });
    const res = await app.request("/admin/dashboard/stats");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, data: { totalUsers: 99 } });
  });

  // Verifies checkout endpoint returns package-specific dodo checkout URL
  // with userId firmly bound into the metadata query params (see PR 0.3 —
  // metadata.userId is the authoritative tie-back used by the webhook
  // handler to credit the correct account).
  it("returns checkout URL with userId metadata bound for known package", async () => {
    const res = await app.request("/payments/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packageKey: "advanced" }),
    });

    expect(res.status).toBe(200);
    const payload = (await res.json()) as { success: boolean; data: { checkoutUrl: string } };
    expect(payload.success).toBe(true);
    const url = new URL(payload.data.checkoutUrl);
    expect(url.origin + url.pathname).toBe(
      "https://test.checkout.dodopayments.com/buy/pdt_0NeNLCAY7sLmCDqKfD2wK",
    );
    expect(url.searchParams.get("metadata_userId")).toBe("auth-user");
    expect(url.searchParams.get("metadata_packageKey")).toBe("advanced");
    expect(url.searchParams.get("metadata_referenceId")).toBe("checkout-ref-functional");
    expect(url.searchParams.get("metadata_checkoutReferenceId")).toBe("checkout-ref-functional");
    expect(url.searchParams.get("redirect_url")).toBe("http://localhost:3200/billing?success=true");
    expect(url.searchParams.get("cancel_url")).toBe("http://localhost:3200/billing?cancel=true");
    expect(mocks.checkoutIntentsService.create).toHaveBeenCalledWith({
      userId: "auth-user",
      billingMode: "credits",
      packageKey: "advanced",
      planKey: undefined,
      productId: "pdt_0NeNLCAY7sLmCDqKfD2wK",
      discountCode: undefined,
      metadata: expect.objectContaining({ source: "payments.checkout" }),
    });
  });

  // Verifies checkout ignores client-controlled return URLs and uses server config.
  it("ignores checkout return URLs from clients", async () => {
    const res = await app.request("/payments/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        packageKey: "advanced",
        successUrl: "https://evil.example/capture",
        cancelUrl: "https://evil.example/cancel",
      }),
    });

    expect(res.status).toBe(200);
    const payload = (await res.json()) as { success: boolean; data: { checkoutUrl: string } };
    const url = new URL(payload.data.checkoutUrl);
    expect(url.searchParams.get("redirect_url")).toBe("http://localhost:3200/billing?success=true");
    expect(url.searchParams.get("cancel_url")).toBe("http://localhost:3200/billing?cancel=true");
  });

  // Verifies customer portal endpoint creates a provider portal session for the authenticated user's known customer.
  it("returns a customer portal URL for the authenticated user", async () => {
    mocks.billingService.getLatestProviderCustomerId.mockResolvedValueOnce("cus_auth_user");
    mocks.dodoCustomerPortal.create.mockResolvedValueOnce({ link: "https://test.customer.dodopayments.com/session/portal_123" });

    const res = await app.request("/me/customer-portal", { method: "POST" });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { portalUrl: "https://test.customer.dodopayments.com/session/portal_123" },
    });
    expect(mocks.billingService.getLatestProviderCustomerId).toHaveBeenCalledWith("auth-user");
    expect(mocks.dodoCustomerPortal.create).toHaveBeenCalledWith("cus_auth_user", {
      return_url: "http://localhost:3200/billing",
    });
  });

  // Verifies customer portal endpoint returns a client-safe error before calling the provider when no customer is known.
  it("returns 404 when the authenticated user has no provider customer", async () => {
    mocks.billingService.getLatestProviderCustomerId.mockResolvedValueOnce(null);

    const res = await app.request("/me/customer-portal", { method: "POST" });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      ...expectApiError("No billing customer found", "NOT_FOUND"),
    });
    expect(mocks.dodoCustomerPortal.create).not.toHaveBeenCalled();
  });

  // Verifies user detail endpoint returns 404 for unknown users.
  it("returns 404 for unknown admin user", async () => {
    mocks.adminService.getUserById.mockResolvedValueOnce(null);

    const userId = "11111111-1111-4111-8111-111111111111";
    const res = await app.request(`/admin/users/${userId}`);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject(expectApiError("User not found", "NOT_FOUND"));
    expect(mocks.adminService.getUserById).toHaveBeenCalledWith(userId);
  });

  // Verifies user detail endpoint returns serialized user for existing IDs.
  it("returns user detail for known admin user", async () => {
    const userId = "22222222-2222-4222-8222-222222222222";
    mocks.adminService.getUserById.mockResolvedValueOnce({ id: userId, email: "john@example.com" });

    const res = await app.request(`/admin/users/${userId}`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { id: userId, email: "john@example.com" },
    });
  });

  // Verifies billing stats endpoint forwards service result without mutation.
  it("returns billing stats from admin service", async () => {
    mocks.adminService.getBillingStats.mockResolvedValueOnce({ totalPurchases: 10, totalRevenue: 123.45 });

    const res = await app.request("/admin/billing/stats");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { totalPurchases: 10, totalRevenue: 123.45 },
    });
  });

  // Verifies revenue endpoint parses and forwards timeRange query parameters.
  it("passes timeRange to revenue endpoint", async () => {
    mocks.adminService.getRevenueData.mockResolvedValueOnce([{ period: "2026-01-01", revenue: 100 }]);

    const res = await app.request("/admin/billing/revenue?timeRange=monthly");

    expect(res.status).toBe(200);
    expect(mocks.adminService.getRevenueData).toHaveBeenCalledWith("monthly");
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: [{ period: "2026-01-01", revenue: 100 }],
    });
  });

  // Verifies transactions endpoint forwards limit, offset and search filters.
  it("passes pagination and search to billing transactions endpoint", async () => {
    mocks.adminService.getAllTransactions.mockResolvedValueOnce({
      transactions: [{ id: "t1" }],
      total: 1,
      hasMore: false,
    });

    const res = await app.request("/admin/billing/transactions?limit=5&offset=10&searchEmail=john@example.com");

    expect(res.status).toBe(200);
    expect(mocks.adminService.getAllTransactions).toHaveBeenCalledWith(5, 10, "john@example.com");
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { transactions: [{ id: "t1" }], total: 1, hasMore: false },
    });
  });

  // Verifies transactions endpoint validates out-of-range query parameters.
  it("validates billing transaction query parameters", async () => {
    const res = await app.request("/admin/billing/transactions?limit=1000&offset=-1");

    expect(res.status).toBe(400);
    await expectValidationError(res, "Invalid transactions query");
  });

  // Verifies purchases endpoint forwards limit, offset and search filters.
  it("passes pagination and search to billing purchases endpoint", async () => {
    mocks.adminService.getAllPurchases.mockResolvedValueOnce({
      purchases: [{ id: "p1" }],
      total: 1,
      hasMore: false,
    });

    const res = await app.request("/admin/billing/purchases?limit=2&offset=0&searchEmail=acme@example.com");

    expect(res.status).toBe(200);
    expect(mocks.adminService.getAllPurchases).toHaveBeenCalledWith(2, 0, "acme@example.com");
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { purchases: [{ id: "p1" }], total: 1, hasMore: false },
    });
  });

  // Verifies transaction chart endpoint returns shaped chart payload.
  it("returns transactions chart data", async () => {
    mocks.adminService.getTransactionData.mockResolvedValueOnce([{ period: "2026-03-01", count: 9 }]);

    const res = await app.request("/admin/billing/transactions-chart?timeRange=weekly");

    expect(res.status).toBe(200);
    expect(mocks.adminService.getTransactionData).toHaveBeenCalledWith("weekly");
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: [{ period: "2026-03-01", count: 9 }],
    });
  });

  // Verifies credits-consumed chart endpoint returns shaped chart payload.
  it("returns credits consumed chart data", async () => {
    mocks.adminService.getCreditsConsumedData.mockResolvedValueOnce([{ period: "2026-03-01", consumed: 42 }]);

    const res = await app.request("/admin/billing/credits-consumed-chart?timeRange=yearly");

    expect(res.status).toBe(200);
    expect(mocks.adminService.getCreditsConsumedData).toHaveBeenCalledWith("yearly");
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: [{ period: "2026-03-01", consumed: 42 }],
    });
  });

  it("returns subscription billing stats", async () => {
    setBillingModeForTest("subscriptions");
    mocks.subscriptionService.getSubscriptionStats.mockResolvedValueOnce({
      totalSubscriptions: 4,
      activeSubscriptions: 2,
      trialingSubscriptions: 1,
      pastDueSubscriptions: 1,
      canceledSubscriptions: 0,
      monthlyRecurringRevenue: 68,
      annualRecurringRevenue: 816,
    });

    const res = await app.request("/admin/billing/subscription-stats");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: {
        totalSubscriptions: 4,
        activeSubscriptions: 2,
        trialingSubscriptions: 1,
        pastDueSubscriptions: 1,
        canceledSubscriptions: 0,
        monthlyRecurringRevenue: 68,
        annualRecurringRevenue: 816,
      },
    });
  });

  it("returns subscription finance summary", async () => {
    setBillingModeForTest("subscriptions");
    mocks.subscriptionService.getSubscriptionFinanceSummary.mockResolvedValueOnce({
      currency: "EUR",
      grossRevenue: 19,
      refundedRevenue: 9,
      netRevenue: 10,
      totalPayments: 4,
      completedPayments: 1,
      refundedPayments: 1,
      failedPayments: 1,
      pendingPayments: 1,
      providerFinanceAvailable: true,
      providerPaymentsChecked: 2,
      providerSubscriptionsChecked: 2,
      unmatchedProviderPayments: 1,
      unmatchedProviderSubscriptions: 1,
    });

    const res = await app.request("/admin/billing/subscription-finance-summary");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: {
        currency: "EUR",
        grossRevenue: 19,
        refundedRevenue: 9,
        netRevenue: 10,
        totalPayments: 4,
        completedPayments: 1,
        refundedPayments: 1,
        failedPayments: 1,
        pendingPayments: 1,
        providerFinanceAvailable: true,
        providerPaymentsChecked: 2,
        providerSubscriptionsChecked: 2,
        unmatchedProviderPayments: 1,
        unmatchedProviderSubscriptions: 1,
      },
    });
  });

  it("returns the credits billing dashboard", async () => {
    const dashboard = {
      stats: {
        totalPurchases: 2,
        totalCreditsPurchased: 120,
        purchasedCredits: 100,
        bonusCredits: 20,
        purchaseBonusCredits: 10,
        voucherCredits: 5,
        refundCredits: -10,
        adminAdjustmentCredits: 15,
        totalCreditsConsumed: 40,
        totalRevenue: 25,
      },
      revenue: { dailyData: [], weeklyData: [], monthlyData: [], yearlyData: [] },
      consumption: { dailyData: [], weeklyData: [], monthlyData: [], yearlyData: [] },
      activity: { dailyData: [], weeklyData: [], monthlyData: [], yearlyData: [] },
      transactions: [],
      purchases: [],
      refundablePurchases: [],
      refundedPurchases: [],
      pagination: {
        purchases: { page: 2, pageSize: 20, totalItems: 25, totalPages: 2, search: "alice@example.com" },
        refunds: { page: 3, pageSize: 20, totalItems: 41, totalPages: 3, search: "bob@example.com" },
      },
      warnings: [],
    };
    mocks.adminCreditsDashboardService.getDashboard.mockResolvedValueOnce(dashboard);

    const res = await app.request(
      "/admin/billing/credits-dashboard?creditsPurchasesPage=2&creditsPurchasesSearch=alice%40example.com&creditsRefundsPage=3&creditsRefundsSearch=bob%40example.com&range=90d",
    );

    expect(res.status).toBe(200);
    expect(mocks.adminCreditsDashboardService.getDashboard).toHaveBeenCalledWith({
      creditsPurchasesPage: 2,
      creditsPurchasesSearch: "alice@example.com",
      creditsRefundsPage: 3,
      creditsRefundsSearch: "bob@example.com",
      range: "90d",
    });
    await expect(res.json()).resolves.toEqual({ success: true, data: dashboard });
  });

  it("creates credit refunds through the admin billing endpoint", async () => {
    mocks.billingService.createCreditRefund.mockResolvedValueOnce({
      purchase: {
        id: "cp_1",
        userId: "user_1",
        paymentId: "pay_credit_1",
        paymentStatus: "refunded",
      },
      refund: {
        refundId: "ref_credit_1",
        paymentId: "pay_credit_1",
        status: "pending",
        amount: 2500,
        currency: "EUR",
      },
    });

    const res = await app.request("/admin/billing/credit-refunds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentId: " pay_credit_1 ", reason: "Duplicate purchase", secret: "admin-secret-value" }),
    });

    expect(res.status).toBe(200);
    expect(mocks.billingService.createCreditRefund).toHaveBeenCalledWith({
      paymentId: "pay_credit_1",
      reason: "Duplicate purchase",
      actorUserId: "auth-user",
    });
    expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
      action: "billing.credit_refund.create",
      targetType: "credit_purchase",
      targetId: "cp_1",
    }));
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: {
        purchase: {
          id: "cp_1",
          userId: "user_1",
          paymentId: "pay_credit_1",
          paymentStatus: "refunded",
        },
        refund: {
          refundId: "ref_credit_1",
          paymentId: "pay_credit_1",
          status: "pending",
          amount: 2500,
          currency: "EUR",
        },
      },
    });
  });

  it("validates credit refund payloads", async () => {
    const res = await app.request("/admin/billing/credit-refunds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentId: " " }),
    });

    expect(res.status).toBe(400);
    await expectValidationError(res, "Invalid credit refund payload");
    expect(mocks.billingService.createCreditRefund).not.toHaveBeenCalled();
  });

  it("passes pagination and search to subscription billing endpoint", async () => {
    setBillingModeForTest("subscriptions");
    mocks.subscriptionService.listSubscriptions.mockResolvedValueOnce({
      subscriptions: [{ id: "sub-row-1", providerSubscriptionId: "sub_1" }],
      total: 1,
      hasMore: false,
    });

    const res = await app.request("/admin/billing/subscriptions?limit=5&offset=10&searchEmail=alice@example.com");

    expect(res.status).toBe(200);
    expect(mocks.subscriptionService.listSubscriptions).toHaveBeenCalledWith(5, 10, "alice@example.com");
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { subscriptions: [{ id: "sub-row-1", providerSubscriptionId: "sub_1" }], total: 1, hasMore: false },
    });
  });

  it("passes pagination and search to subscription payments endpoint", async () => {
    setBillingModeForTest("subscriptions");
    mocks.subscriptionService.listSubscriptionPayments.mockResolvedValueOnce({
      payments: [{ id: "sp_1", paymentId: "pay_1", userEmail: "alice@example.com" }],
      total: 1,
      hasMore: false,
    });

    const res = await app.request("/admin/billing/subscription-payments?limit=5&offset=10&searchEmail=alice@example.com");

    expect(res.status).toBe(200);
    expect(mocks.subscriptionService.listSubscriptionPayments).toHaveBeenCalledWith(5, 10, "alice@example.com");
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { payments: [{ id: "sp_1", paymentId: "pay_1", userEmail: "alice@example.com" }], total: 1, hasMore: false },
    });
  });

  it("returns subscription plan distribution", async () => {
    setBillingModeForTest("subscriptions");
    mocks.subscriptionService.getPlanDistribution.mockResolvedValueOnce([
      { planKey: "starter", count: 2 },
      { planKey: "pro", count: 1 },
    ]);

    const res = await app.request("/admin/billing/subscription-plan-distribution");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: [
        { planKey: "starter", count: 2 },
        { planKey: "pro", count: 1 },
      ],
    });
  });

  it("returns subscription events with limit", async () => {
    setBillingModeForTest("subscriptions");
    mocks.subscriptionService.listSubscriptionEvents.mockResolvedValueOnce([
      {
        id: "evt_1",
        userId: "user_1",
        providerSubscriptionId: "sub_1",
        dodoSubscriptionId: "sub_1",
        eventType: "subscription.active",
        status: "active",
        createdAt: "2026-04-30T10:00:00.000Z",
      },
    ]);

    const res = await app.request("/admin/billing/subscription-events?limit=25");

    expect(res.status).toBe(200);
    expect(mocks.subscriptionService.listSubscriptionEvents).toHaveBeenCalledWith(25);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: [
        {
          id: "evt_1",
          userId: "user_1",
          providerSubscriptionId: "sub_1",
          dodoSubscriptionId: "sub_1",
          eventType: "subscription.active",
          status: "active",
          createdAt: "2026-04-30T10:00:00.000Z",
        },
      ],
    });
  });

  it("creates subscription refunds through the admin billing endpoint", async () => {
    setBillingModeForTest("subscriptions");
    mocks.subscriptionService.createSubscriptionRefund.mockResolvedValueOnce({
      payment: {
        id: "sp_1",
        userId: "user_1",
        paymentId: "pay_1",
        paymentStatus: "refunded",
      },
      refund: {
        refundId: "ref_1",
        paymentId: "pay_1",
        status: "pending",
        amount: 1900,
        currency: "EUR",
      },
    });

    const res = await app.request("/admin/billing/subscription-refunds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentId: " pay_1 ", reason: "Customer request", secret: "admin-secret-value" }),
    });

    expect(res.status).toBe(200);
    expect(mocks.subscriptionService.createSubscriptionRefund).toHaveBeenCalledWith({
      paymentId: "pay_1",
      reason: "Customer request",
      actorUserId: "auth-user",
    });
    expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
      action: "billing.subscription_refund.create",
      targetType: "subscription_payment",
      targetId: "sp_1",
    }));
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: {
        payment: {
          id: "sp_1",
          userId: "user_1",
          paymentId: "pay_1",
          paymentStatus: "refunded",
        },
        refund: {
          refundId: "ref_1",
          paymentId: "pay_1",
          status: "pending",
          amount: 1900,
          currency: "EUR",
        },
      },
    });
  });

  it("validates subscription refund payloads", async () => {
    const res = await app.request("/admin/billing/subscription-refunds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentId: " " }),
    });

    expect(res.status).toBe(400);
    await expectValidationError(res, "Invalid subscription refund payload");
    expect(mocks.subscriptionService.createSubscriptionRefund).not.toHaveBeenCalled();
  });

  // Verifies the admin webhook monitor can list stored webhook events.
  it("lists admin webhook events", async () => {
    const response = await app.request("/admin/webhooks?limit=20&offset=0&status=processed&text=evt_123");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(1);
    expect(body.data.events[0]).toMatchObject({
      provider: "dodo",
      providerEventId: "evt_123",
      processingStatus: "processed",
    });
    expect(body.data.events[0].createdAt).toBe("2026-04-28T09:00:00.000Z");
  });

  // Verifies the admin webhook monitor exposes aggregate processing health.
  it("returns admin webhook stats", async () => {
    const response = await app.request("/admin/webhooks/stats");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual({ total: 3, processing: 0, processed: 1, failed: 2 });
  });

  // Verifies the admin webhook monitor can inspect a stored webhook event.
  it("returns admin webhook event details", async () => {
    const response = await app.request("/admin/webhooks/11111111-1111-4111-8111-111111111111");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.providerEventId).toBe("evt_123");
  });

  // Verifies user listing and stats endpoints both return service payloads.
  it("returns admin users list and stats", async () => {
    mocks.adminService.getUsers.mockResolvedValueOnce([{ id: "u1" }]);
    mocks.adminService.getUserStats.mockResolvedValueOnce({ totalUsers: 10, totalAdmins: 2, totalBanned: 1 });

    const usersRes = await app.request("/admin/users");
    const statsRes = await app.request("/admin/users/stats");

    expect(usersRes.status).toBe(200);
    expect(statsRes.status).toBe(200);
    await expect(usersRes.json()).resolves.toEqual({ success: true, data: [{ id: "u1" }] });
    await expect(statsRes.json()).resolves.toEqual({ success: true, data: { totalUsers: 10, totalAdmins: 2, totalBanned: 1 } });
  });

  // Verifies admin user listing forwards submitted server-side filters.
  it("passes pagination, search, and role to admin users endpoint", async () => {
    mocks.adminService.getUsers.mockResolvedValueOnce({ users: [{ id: "u1" }], total: 1 });

    const res = await app.request("/admin/users?limit=20&offset=0&search=%20alice%20&role=admin");

    expect(res.status).toBe(200);
    expect(mocks.adminService.getUsers).toHaveBeenCalledWith(20, 0, "alice", "admin");
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { users: [{ id: "u1" }], total: 1 },
    });
  });

  // Verifies user credit sub-resources all return expected payloads.
  it("returns admin user credit endpoints", async () => {
    mocks.adminService.getUserCreditBalance.mockResolvedValueOnce({ balance: 50 });
    mocks.adminService.getUserCreditHistory.mockResolvedValueOnce([{ id: "h1" }]);
    mocks.adminService.getUserCreditPurchases.mockResolvedValueOnce([{ id: "cp1" }]);

    const userId = "11111111-1111-4111-8111-111111111111";
    const balanceRes = await app.request(`/admin/users/${userId}/credits/balance`);
    const historyRes = await app.request(`/admin/users/${userId}/credits/history`);
    const purchasesRes = await app.request(`/admin/users/${userId}/credits/purchases`);

    expect(balanceRes.status).toBe(200);
    expect(historyRes.status).toBe(200);
    expect(purchasesRes.status).toBe(200);
    await expect(balanceRes.json()).resolves.toEqual({ success: true, data: { balance: 50 } });
    await expect(historyRes.json()).resolves.toEqual({ success: true, data: [{ id: "h1" }] });
    await expect(purchasesRes.json()).resolves.toEqual({ success: true, data: [{ id: "cp1" }] });
  });

  // Verifies malformed user identifiers are rejected before service calls.
  it("validates malformed admin user ids", async () => {
    const res = await app.request("/admin/users/not-a-uuid");

    expect(res.status).toBe(400);
    await expectValidationError(res, "Invalid user id");
  });

  // Verifies verify-admin-secret maps service success/failure to HTTP status.
  it("handles verify-admin-secret success and failure status codes", async () => {
    mocks.adminService.verifyAdminSecret.mockResolvedValueOnce({ success: true });
    mocks.adminService.verifyAdminSecret.mockResolvedValueOnce({ success: false, error: "Invalid secret key provided." });

    const okRes = await app.request("/admin/verify-admin-secret", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: "good" }),
    });
    const failRes = await app.request("/admin/verify-admin-secret", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: "bad" }),
    });

    expect(okRes.status).toBe(200);
    expect(failRes.status).toBe(400);
  });

  it("returns admin status without requiring an admin secret", async () => {
    const res = await app.request("/admin/status", {
      method: "GET",
      headers: {
        cookie: "better-auth.session_token=session-token",
      },
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: {
        message: "Admin access granted.",
        totpRequired: false,
        twoFactorEnabled: true,
        canEnrollTotp: true,
      },
    });
  });

  // Verifies verify-admin-secret rejects malformed payloads.
  it("validates verify-admin-secret payload", async () => {
    const res = await app.request("/admin/verify-admin-secret", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: "" }),
    });

    expect(res.status).toBe(400);
    await expectValidationError(res, "Invalid secret payload");
  });

  // Verifies direct ban API calls cannot bypass the admin secret.
  it("requires a valid admin secret on the admin ban mutation", async () => {
    mocks.adminService.verifyAdminSecret.mockResolvedValueOnce({ success: false, error: "Invalid secret key provided." });

    const res = await app.request("/admin/users/ban", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "11111111-1111-4111-8111-111111111111",
        secret: "wrong-secret",
      }),
    });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      ...expectApiError("Invalid secret key provided.", "FORBIDDEN"),
    });
    expect(mocks.adminAuthApi.banUser).not.toHaveBeenCalled();
  });

  it("blocks admins from changing their own role while allowing unchanged self role sets", async () => {
    const authUserId = "11111111-1111-4111-8111-111111111111";
    mocks.adminService.getUserById.mockResolvedValue({ id: authUserId, role: "admin", banned: false });
    mocks.adminService.verifyAdminSecret.mockResolvedValue({ success: true });
    mocks.adminAuthApi.setRole.mockResolvedValue({ success: true });

    const demoteRes = await app.request("/admin/users/set-role", {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-auth-user-id": authUserId },
      body: JSON.stringify({ userId: authUserId, role: "user", reason: "self demotion", confirmed: true, secret: "admin-secret-value" }),
    });
    const unchangedRes = await app.request("/admin/users/set-role", {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-auth-user-id": authUserId },
      body: JSON.stringify({ userId: authUserId, role: "admin", secret: "admin-secret-value" }),
    });

    expect(demoteRes.status).toBe(403);
    await expect(demoteRes.json()).resolves.toMatchObject({
      ...expectApiError("You cannot change your own role.", "FORBIDDEN"),
    });
    expect(unchangedRes.status).toBe(200);
    expect(mocks.adminAuthApi.setRole).toHaveBeenCalledTimes(1);
    expect(mocks.adminAuthApi.setRole).toHaveBeenCalledWith(expect.objectContaining({
      body: { userId: authUserId, role: "admin" },
    }));
  });

  it("blocks demoting the last active admin", async () => {
    const userId = "22222222-2222-4222-8222-222222222222";
    mocks.adminService.getUserById.mockResolvedValue({ id: userId, role: "admin", banned: false });
    mocks.adminService.countActiveAdmins.mockResolvedValue(1);
    mocks.adminService.verifyAdminSecret.mockResolvedValue({ success: true });

    const res = await app.request("/admin/users/set-role", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, role: "user", reason: "offboarding", confirmed: true, secret: "admin-secret-value" }),
    });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      ...expectApiError("Cannot demote the last active admin.", "FORBIDDEN"),
    });
    expect(mocks.adminAuthApi.setRole).not.toHaveBeenCalled();
    expect(mocks.adminAuthApi.revokeUserSessions).not.toHaveBeenCalled();
  });

  it("requires a reason for role changes and confirmation for admin demotions", async () => {
    const userId = "22222222-2222-4222-8222-222222222222";
    mocks.adminService.getUserById.mockResolvedValueOnce({ id: userId, role: "user", banned: false });
    mocks.adminService.getUserById.mockResolvedValueOnce({ id: userId, role: "admin", banned: false });
    mocks.adminService.verifyAdminSecret.mockResolvedValue({ success: true });

    const missingReasonRes = await app.request("/admin/users/set-role", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, role: "admin", secret: "admin-secret-value" }),
    });
    const missingConfirmationRes = await app.request("/admin/users/set-role", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, role: "user", reason: "offboarding", secret: "admin-secret-value" }),
    });

    expect(missingReasonRes.status).toBe(403);
    await expect(missingReasonRes.json()).resolves.toMatchObject({
      ...expectApiError("A reason is required for role changes.", "FORBIDDEN"),
    });
    expect(missingConfirmationRes.status).toBe(403);
    await expect(missingConfirmationRes.json()).resolves.toMatchObject({
      ...expectApiError("Explicit confirmation is required to remove admin access.", "FORBIDDEN"),
    });
    expect(mocks.adminAuthApi.setRole).not.toHaveBeenCalled();
  });

  it("revokes target sessions after a successful role change", async () => {
    const userId = "22222222-2222-4222-8222-222222222222";
    mocks.adminService.getUserById.mockResolvedValue({ id: userId, role: "user", banned: false });
    mocks.adminService.verifyAdminSecret.mockResolvedValue({ success: true });
    mocks.adminAuthApi.setRole.mockResolvedValueOnce({ success: true });
    mocks.adminAuthApi.revokeUserSessions.mockResolvedValueOnce({ success: true });

    const res = await app.request("/admin/users/set-role", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, role: "admin", reason: "support coverage", secret: "admin-secret-value" }),
    });

    expect(res.status).toBe(200);
    expect(mocks.adminAuthApi.setRole).toHaveBeenCalledWith(expect.objectContaining({
      body: { userId, role: "admin" },
    }));
    expect(mocks.adminAuthApi.revokeUserSessions).toHaveBeenCalledWith(expect.objectContaining({
      body: { userId },
    }));
  });

  it("blocks banning the last active admin", async () => {
    const userId = "22222222-2222-4222-8222-222222222222";
    mocks.adminService.verifyAdminSecret.mockResolvedValueOnce({ success: true });
    mocks.adminService.getUserById.mockResolvedValue({ id: userId, role: "admin", banned: false });
    mocks.adminService.countActiveAdmins.mockResolvedValue(1);

    const res = await app.request("/admin/users/ban", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId,
        banReason: "policy violation",
        secret: "ban-secret-value",
      }),
    });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      ...expectApiError("Cannot ban the last active admin.", "FORBIDDEN"),
    });
    expect(mocks.adminAuthApi.banUser).not.toHaveBeenCalled();
  });

  it("blocks impersonating administrator accounts", async () => {
    const userId = "22222222-2222-4222-8222-222222222222";
    mocks.adminService.getUserById.mockResolvedValue({ id: userId, role: "admin", banned: false });
    mocks.adminService.verifyAdminSecret.mockResolvedValue({ success: true });

    const res = await app.request("/admin/users/impersonate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, secret: "admin-secret-value" }),
    });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      ...expectApiError("Administrator accounts cannot be impersonated.", "FORBIDDEN"),
    });
    expect(mocks.adminAuthApi.impersonateUser).not.toHaveBeenCalled();
  });

  it("blocks impersonating self or banned users", async () => {
    const selfId = "11111111-1111-4111-8111-111111111111";
    const bannedUserId = "22222222-2222-4222-8222-222222222222";
    mocks.adminService.getUserById.mockResolvedValueOnce({ id: selfId, role: "user", banned: false });
    mocks.adminService.getUserById.mockResolvedValueOnce({ id: bannedUserId, role: "user", banned: true });
    mocks.adminService.verifyAdminSecret.mockResolvedValue({ success: true });

    const selfRes = await app.request("/admin/users/impersonate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-auth-user-id": selfId },
      body: JSON.stringify({ userId: selfId, secret: "admin-secret-value" }),
    });
    const bannedRes = await app.request("/admin/users/impersonate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: bannedUserId, secret: "admin-secret-value" }),
    });

    expect(selfRes.status).toBe(403);
    expect(bannedRes.status).toBe(403);
    expect(mocks.adminAuthApi.impersonateUser).not.toHaveBeenCalled();
  });

  it("fails closed when critical admin auth audit recording fails", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    mocks.adminService.verifyAdminSecret.mockResolvedValue({ success: true });
    mocks.adminAuthApi.revokeUserSessions.mockResolvedValue({ success: true });
    mocks.auditService.recordAuditEntry.mockResolvedValueOnce({ success: false, error: "Failed to record audit entry" });

    const res = await app.request("/admin/users/revoke-sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, secret: "admin-secret-value" }),
    });

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({
      ...expectApiError("Audit logging unavailable", "BAD_REQUEST"),
    });
  });

  it("blocks admin mutations while impersonating another user", async () => {
    const userId = "22222222-2222-4222-8222-222222222222";

    const res = await app.request("/admin/users/revoke-sessions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-impersonated-by": "admin-origin" },
      body: JSON.stringify({ userId, secret: "admin-secret-value" }),
    });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      ...expectApiError("Admin actions are blocked while impersonating another user.", "FORBIDDEN"),
    });
    expect(mocks.adminAuthApi.revokeUserSessions).not.toHaveBeenCalled();
  });

  it("records audit entries for admin auth mutations", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    mocks.adminService.verifyAdminSecret.mockResolvedValue({ success: true });
    mocks.adminService.getUserById.mockResolvedValue({ id: userId, role: "user", banned: false });
    mocks.adminAuthApi.setRole.mockResolvedValueOnce({ success: true });
    mocks.adminAuthApi.revokeUserSessions.mockResolvedValue({ success: true });
    mocks.adminAuthApi.banUser.mockResolvedValueOnce({ success: true });
    mocks.adminAuthApi.unbanUser.mockResolvedValueOnce({ success: true });
    mocks.adminAuthApi.impersonateUser.mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    mocks.adminAuthApi.setUserPassword.mockResolvedValueOnce({ success: true });

    const setRoleRes = await app.request("/admin/users/set-role", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, role: "admin", reason: "security coverage", secret: "admin-secret-value" }),
    });
    const banRes = await app.request("/admin/users/ban", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId,
        banReason: "policy violation",
        banExpiresIn: 3600,
        secret: "ban-secret-value",
      }),
    });
    const unbanRes = await app.request("/admin/users/unban", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, secret: "admin-secret-value" }),
    });
    const impersonateRes = await app.request("/admin/users/impersonate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, secret: "admin-secret-value" }),
    });
    const setPasswordRes = await app.request("/admin/users/set-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, newPassword: "correct horse battery staple", secret: "admin-secret-value" }),
    });

    expect(setRoleRes.status).toBe(200);
    expect(banRes.status).toBe(200);
    expect(unbanRes.status).toBe(200);
    expect(impersonateRes.status).toBe(200);
    expect(setPasswordRes.status).toBe(200);
    expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.user.set_role",
      outcome: "success",
      actorId: "auth-user",
      targetType: "user",
      targetId: userId,
      after: { role: "admin" },
      metadata: expect.objectContaining({
        previousRole: "user",
        nextRole: "admin",
        reason: "security coverage",
      }),
    }));
    expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.user.ban",
      outcome: "success",
      actorId: "auth-user",
      targetType: "user",
      targetId: userId,
      after: { banned: true, userId, banReason: "policy violation", banExpiresIn: 3600 },
    }));
    expect(mocks.adminAuthApi.banUser).toHaveBeenCalledWith(expect.objectContaining({
      body: { userId, banReason: "policy violation", banExpiresIn: 3600 },
    }));
    expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.user.unban",
      outcome: "success",
      actorId: "auth-user",
      targetType: "user",
      targetId: userId,
      after: { banned: false },
    }));
    expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.impersonation.start",
      outcome: "success",
      actorId: "auth-user",
      targetType: "user",
      targetId: userId,
    }));
    expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.user.set_password",
      outcome: "success",
      actorId: "auth-user",
      targetType: "user",
      targetId: userId,
      after: { passwordUpdated: true },
    }));

    const auditPayloads = mocks.auditService.recordAuditEntry.mock.calls.map(([payload]) => payload);
    expect(JSON.stringify(auditPayloads)).not.toContain("ban-secret-value");
    expect(JSON.stringify(auditPayloads)).not.toContain("correct horse battery staple");
  });

  it("records a safe audit entry when revoking user sessions", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    mocks.adminService.verifyAdminSecret.mockResolvedValue({ success: true });
    mocks.adminAuthApi.revokeUserSessions.mockResolvedValue({ success: true });

    const res = await app.request("/admin/users/revoke-sessions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer raw-admin-token" },
      body: JSON.stringify({ userId, secret: "admin-secret-value" }),
    });

    expect(res.status).toBe(200);
    expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.user.revoke_sessions",
      outcome: "success",
      actorId: "auth-user",
      targetType: "user",
      targetId: userId,
      after: { sessionsRevoked: true },
    }));

    const auditPayloads = mocks.auditService.recordAuditEntry.mock.calls.map(([payload]) => payload);
    expect(JSON.stringify(auditPayloads)).not.toContain("raw-admin-token");

    mocks.auditService.recordAuditEntry.mockResolvedValueOnce({ success: false, error: "Failed to record audit entry" });
    const auditFailureRes = await app.request("/admin/users/revoke-sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, secret: "admin-secret-value" }),
    });

    expect(auditFailureRes.status).toBe(503);
  });

  it("rejects unsupported absolute admin ban expiry without auditing it", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";

    const res = await app.request("/admin/users/ban", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId,
        banReason: "policy violation",
        banExpires: "2026-05-01T00:00:00.000Z",
        secret: "ban-secret-value",
      }),
    });

    expect(res.status).toBe(400);
    await expectValidationError(res, "Invalid ban payload");
    expect(mocks.adminService.verifyAdminSecret).not.toHaveBeenCalled();
    expect(mocks.adminAuthApi.banUser).not.toHaveBeenCalled();
    expect(mocks.auditService.recordAuditEntry).not.toHaveBeenCalled();
  });

  it("records audit entry when stopping admin impersonation", async () => {
    mocks.adminAuthApi.stopImpersonating.mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

    const res = await app.request("/auth/admin/stop-impersonating", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.impersonation.stop",
      outcome: "success",
      actorId: "auth-user",
      targetType: "session",
      metadata: { stopped: true },
    }));
  });

  // Verifies admin-set passwords follow the same minimum policy as normal password flows.
  it("rejects weak admin-set passwords", async () => {
    const res = await app.request("/admin/users/set-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "11111111-1111-4111-8111-111111111111",
        newPassword: "short",
      }),
    });

    expect(res.status).toBe(400);
    await expectValidationError(res, "Invalid password payload");
    expect(mocks.adminAuthApi.setUserPassword).not.toHaveBeenCalled();
  });

  // Verifies discount code validation endpoint rejects malformed input.
  it("validates discount code request body", async () => {
    const res = await app.request("/admin/discounts/validate-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    await expectValidationError(res, "Invalid discount validation payload");
  });

  // Verifies provider-wide discount CRUD routes are wired while selected-user assignment routes are not exposed.
  it("routes discount CRUD without assignment operations", async () => {
    mocks.discountsService.createDiscount.mockResolvedValueOnce({ success: true, data: { id: "d1" } });
    mocks.discountsService.updateDiscount.mockResolvedValueOnce({ success: true, data: { id: "d1" } });
    mocks.discountsService.deleteDiscount.mockResolvedValueOnce({ success: true });
    mocks.adminService.verifyAdminSecret.mockResolvedValue({ success: true });

    const createRes = await app.request("/admin/discounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: "SAVE-ABC-1234",
        type: "percentage",
        value: 10,
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-12-31T00:00:00.000Z",
        secret: "admin-secret-value",
      }),
    });

    const discountId = "33333333-3333-4333-8333-333333333333";
    const userIds = [
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
    ];

    const patchRes = await app.request(`/admin/discounts/${discountId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: 20, secret: "admin-secret-value" }),
    });

    const assignRes = await app.request(`/admin/discounts/${discountId}/assign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds }),
    });

    const removeRes = await app.request(`/admin/discounts/${discountId}/remove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: [userIds[0]] }),
    });

    const deleteRes = await app.request(`/admin/discounts/${discountId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: "admin-secret-value" }),
    });

    expect(createRes.status).toBe(200);
    expect(patchRes.status).toBe(200);
    expect(assignRes.status).toBe(404);
    expect(removeRes.status).toBe(404);
    expect(deleteRes.status).toBe(200);
    expect(mocks.discountsService.updateDiscount).toHaveBeenCalledWith(
      expect.objectContaining({
        id: discountId,
        value: 20,
      }),
    );
    expect(mocks.discountsService.assignDiscountToUsers).not.toHaveBeenCalled();
    expect(mocks.discountsService.removeDiscountFromUsers).not.toHaveBeenCalled();
  });

  it("records safe audit entries for discount mutations", async () => {
    const discountId = "33333333-3333-4333-8333-333333333333";
    const createdDiscount = {
      id: "44444444-4444-4444-8444-444444444444",
      code: "SAVE-ABC-1234",
      type: "percentage",
      value: 10,
      providerDiscountId: "provider-secret-discount-id",
      dodoDiscountId: "provider-secret-discount-id",
    };
    const previousDiscount = {
      id: discountId,
      code: "SAVE-ABC-1234",
      type: "percentage",
      value: 10,
      status: "active",
      providerDiscountId: "provider-secret-discount-id",
      dodoDiscountId: "provider-secret-discount-id",
    };
    const updatedDiscount = {
      id: discountId,
      code: "SAVE-ABC-1234",
      type: "percentage",
      value: 20,
      status: "active",
    };

    mocks.discountsService.createDiscount.mockResolvedValueOnce({ success: true, discount: createdDiscount });
    mocks.discountsService.updateDiscount.mockResolvedValueOnce({ success: true, discount: updatedDiscount, previousDiscount });
    mocks.discountsService.deleteDiscount.mockResolvedValueOnce({ success: true, previousDiscount });
    mocks.adminService.verifyAdminSecret.mockResolvedValue({ success: true });

    const createRes = await app.request("/admin/discounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: "SAVE-ABC-1234",
        type: "percentage",
        value: 10,
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-12-31T00:00:00.000Z",
        secret: "admin-secret-value",
      }),
    });
    const patchRes = await app.request(`/admin/discounts/${discountId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: 20, secret: "admin-secret-value" }),
    });
    const deleteRes = await app.request(`/admin/discounts/${discountId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: "admin-secret-value" }),
    });

    expect(createRes.status).toBe(200);
    expect(patchRes.status).toBe(200);
    expect(deleteRes.status).toBe(200);
    await expect(patchRes.json()).resolves.toEqual({ success: true, discount: updatedDiscount });
    await expect(deleteRes.json()).resolves.toEqual({ success: true });
    expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
      action: "discount.create",
      outcome: "success",
      actorId: "auth-user",
      targetType: "discount",
      targetId: createdDiscount.id,
      after: expect.objectContaining({ id: createdDiscount.id, code: "SAVE-ABC-1234", value: 10 }),
      metadata: { code: "SAVE-ABC-1234" },
    }));
    expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
      action: "discount.update",
      outcome: "success",
      actorId: "auth-user",
      targetType: "discount",
      targetId: discountId,
      before: expect.objectContaining({ id: discountId, code: "SAVE-ABC-1234", value: 10 }),
      after: expect.objectContaining({ id: discountId, code: "SAVE-ABC-1234", value: 20 }),
      metadata: { code: "SAVE-ABC-1234" },
    }));
    expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
      action: "discount.delete",
      outcome: "success",
      actorId: "auth-user",
      targetType: "discount",
      targetId: discountId,
      before: expect.objectContaining({ id: discountId, code: "SAVE-ABC-1234", value: 10 }),
      metadata: { code: "SAVE-ABC-1234" },
    }));

    const auditPayloads = mocks.auditService.recordAuditEntry.mock.calls.map(([payload]) => payload);
    expect(JSON.stringify(auditPayloads)).not.toContain("provider-secret-discount-id");
  });

  it("records discount mutation failures without changing response envelopes", async () => {
    mocks.discountsService.createDiscount.mockResolvedValueOnce({ success: false, error: "Discount code already exists" });
    mocks.adminService.verifyAdminSecret.mockResolvedValue({ success: true });

    const res = await app.request("/admin/discounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: "SAVE-ABC-1234",
        type: "percentage",
        value: 10,
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-12-31T00:00:00.000Z",
        secret: "admin-secret-value",
      }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject(expectApiError("Discount code already exists"));
    expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
      action: "discount.create",
      outcome: "failure",
      actorId: "auth-user",
      targetType: "discount",
      targetId: null,
      after: null,
      metadata: { error: "Discount code already exists" },
    }));
  });

  it("records safe failure audit entries when discount mutations throw", async () => {
    const discountId = "33333333-3333-4333-8333-333333333333";
    mocks.discountsService.createDiscount.mockRejectedValueOnce(new Error("Discount provider request failed"));
    mocks.discountsService.updateDiscount.mockRejectedValueOnce(new Error("Discount provider request failed"));
    mocks.discountsService.deleteDiscount.mockRejectedValueOnce(new Error("Discount provider request failed"));
    mocks.adminService.verifyAdminSecret.mockResolvedValue({ success: true });

    const createRes = await app.request("/admin/discounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: "SAVE-ABC-1234",
        type: "percentage",
        value: 10,
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-12-31T00:00:00.000Z",
        secret: "admin-secret-value",
      }),
    });
    const patchRes = await app.request(`/admin/discounts/${discountId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: 20, secret: "admin-secret-value" }),
    });
    const deleteRes = await app.request(`/admin/discounts/${discountId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: "admin-secret-value" }),
    });

    expect(createRes.status).toBe(500);
    expect(patchRes.status).toBe(500);
    expect(deleteRes.status).toBe(500);
    await expect(createRes.json()).resolves.toMatchObject(expectApiError("Internal server error", "INTERNAL_SERVER_ERROR"));
    await expect(patchRes.json()).resolves.toMatchObject(expectApiError("Internal server error", "INTERNAL_SERVER_ERROR"));
    await expect(deleteRes.json()).resolves.toMatchObject(expectApiError("Internal server error", "INTERNAL_SERVER_ERROR"));
    expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
      action: "discount.create",
      outcome: "failure",
      actorId: "auth-user",
      targetType: "discount",
      targetId: null,
      metadata: { error: "Discount provider request failed" },
    }));
    expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
      action: "discount.update",
      outcome: "failure",
      actorId: "auth-user",
      targetType: "discount",
      targetId: discountId,
      metadata: { error: "Discount provider request failed" },
    }));
    expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
      action: "discount.delete",
      outcome: "failure",
      actorId: "auth-user",
      targetType: "discount",
      targetId: discountId,
      metadata: { error: "Discount provider request failed" },
    }));
  });

  // Verifies voucher list and search endpoints pass validated filters to the service.
  it("routes voucher listing and user search", async () => {
    mocks.vouchersService.getVouchers.mockResolvedValueOnce({
      vouchers: [{ id: "v1", code: "WELCOME10" }],
      total: 1,
      hasMore: false,
    });
    mocks.vouchersService.searchUsers.mockResolvedValueOnce([
      { id: "u1", name: "John Doe", email: "john@example.com" },
    ]);

    const listRes = await app.request("/admin/vouchers?limit=5&offset=10&search=welcome&status=active");
    const searchRes = await app.request("/admin/vouchers/search-users?query=john&limit=5");

    expect(listRes.status).toBe(200);
    expect(searchRes.status).toBe(200);
    expect(mocks.vouchersService.getVouchers).toHaveBeenCalledWith(5, 10, "welcome", "active");
    expect(mocks.vouchersService.searchUsers).toHaveBeenCalledWith("john", 5);
    await expect(listRes.json()).resolves.toEqual({
      success: true,
      data: {
        vouchers: [{ id: "v1", code: "WELCOME10" }],
        total: 1,
        hasMore: false,
      },
    });
    await expect(searchRes.json()).resolves.toEqual({
      success: true,
      data: [{ id: "u1", name: "John Doe", email: "john@example.com" }],
    });
  });

  // Verifies voucher CRUD routes delegate payloads to the voucher service.
  it("routes voucher CRUD operations", async () => {
    mocks.vouchersService.createVoucher.mockResolvedValueOnce({ success: true, voucher: { id: "v1" } });
    mocks.vouchersService.getVoucherById.mockResolvedValueOnce({ success: true, voucher: { id: "v1" } });
    mocks.vouchersService.updateVoucher.mockResolvedValueOnce({ success: true, voucher: { id: "v1" } });
    mocks.adminService.verifyAdminSecret.mockResolvedValue({ success: true });

    const voucherId = "77777777-7777-4777-8777-777777777777";
    const createRes = await app.request("/admin/vouchers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: "WELCOME10",
        creditAmount: 10,
        assignmentScope: "selected",
        userIds: ["11111111-1111-4111-8111-111111111111"],
        expiresAt: "2026-12-31T00:00:00.000Z",
        secret: "admin-secret-value",
      }),
    });
    const getRes = await app.request(`/admin/vouchers/${voucherId}`);
    const patchRes = await app.request(`/admin/vouchers/${voucherId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "inactive", secret: "admin-secret-value" }),
    });

    expect(createRes.status).toBe(200);
    expect(getRes.status).toBe(200);
    expect(patchRes.status).toBe(200);
    expect(mocks.vouchersService.createVoucher).toHaveBeenCalledWith({
      code: "WELCOME10",
      creditAmount: 10,
      assignmentScope: "selected",
      userIds: ["11111111-1111-4111-8111-111111111111"],
      expiresAt: new Date("2026-12-31T00:00:00.000Z"),
    });
    expect(mocks.vouchersService.getVoucherById).toHaveBeenCalledWith(voucherId);
    expect(mocks.vouchersService.updateVoucher).toHaveBeenCalledWith({
      id: voucherId,
      status: "inactive",
    });
  });

  it("records safe audit entries for voucher mutations", async () => {
    const voucherId = "77777777-7777-4777-8777-777777777777";
    const createdVoucher = {
      id: "88888888-8888-4888-8888-888888888888",
      code: "WELCOME10",
      creditAmount: 10,
      status: "active",
      rawPaymentPayload: "raw-provider-secret",
    };
    const updatedVoucher = {
      id: voucherId,
      code: "WELCOME10",
      creditAmount: 25,
      status: "inactive",
    };
    const previousVoucher = {
      id: voucherId,
      code: "WELCOME10",
      creditAmount: 10,
      status: "active",
      rawPaymentPayload: "raw-provider-secret",
    };

    mocks.vouchersService.createVoucher.mockResolvedValueOnce({ success: true, voucher: createdVoucher });
    mocks.vouchersService.updateVoucher.mockResolvedValueOnce({ success: true, voucher: updatedVoucher, previousVoucher });
    mocks.adminService.verifyAdminSecret.mockResolvedValue({ success: true });

    const createRes = await app.request("/admin/vouchers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: "WELCOME10",
        creditAmount: 10,
        assignmentScope: "selected",
        userIds: ["11111111-1111-4111-8111-111111111111"],
        expiresAt: "2026-12-31T00:00:00.000Z",
        secret: "admin-secret-value",
      }),
    });
    const patchRes = await app.request(`/admin/vouchers/${voucherId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creditAmount: 25, status: "inactive", secret: "admin-secret-value" }),
    });

    expect(createRes.status).toBe(200);
    expect(patchRes.status).toBe(200);
    await expect(patchRes.json()).resolves.toEqual({ success: true, voucher: updatedVoucher });
    expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
      action: "voucher.create",
      outcome: "success",
      actorId: "auth-user",
      targetType: "voucher",
      targetId: createdVoucher.id,
      after: expect.objectContaining({ id: createdVoucher.id, code: "WELCOME10", creditAmount: 10 }),
      metadata: { code: "WELCOME10" },
    }));
    expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
      action: "voucher.update",
      outcome: "success",
      actorId: "auth-user",
      targetType: "voucher",
      targetId: voucherId,
      before: expect.objectContaining({ id: voucherId, code: "WELCOME10", creditAmount: 10, status: "active" }),
      after: expect.objectContaining({ id: voucherId, code: "WELCOME10", creditAmount: 25, status: "inactive" }),
      metadata: { code: "WELCOME10" },
    }));

    const auditPayloads = mocks.auditService.recordAuditEntry.mock.calls.map(([payload]) => payload);
    expect(JSON.stringify(auditPayloads)).not.toContain("raw-provider-secret");
  });

  it("records voucher mutation failures without changing response envelopes", async () => {
    mocks.vouchersService.updateVoucher.mockResolvedValueOnce({ success: false, error: "Voucher not found" });
    mocks.adminService.verifyAdminSecret.mockResolvedValue({ success: true });

    const voucherId = "77777777-7777-4777-8777-777777777777";
    const res = await app.request(`/admin/vouchers/${voucherId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "inactive", secret: "admin-secret-value" }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject(expectApiError("Voucher not found"));
    expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
      action: "voucher.update",
      outcome: "failure",
      actorId: "auth-user",
      targetType: "voucher",
      targetId: voucherId,
      after: null,
      metadata: { error: "Voucher not found" },
    }));
  });

  it("records safe failure audit entries when voucher mutations throw", async () => {
    const voucherId = "77777777-7777-4777-8777-777777777777";
    mocks.vouchersService.createVoucher.mockRejectedValueOnce(new Error("Voucher provider request failed"));
    mocks.vouchersService.updateVoucher.mockRejectedValueOnce(new Error("Voucher provider request failed"));
    mocks.adminService.verifyAdminSecret.mockResolvedValue({ success: true });

    const createRes = await app.request("/admin/vouchers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: "WELCOME10",
        creditAmount: 10,
        assignmentScope: "selected",
        userIds: ["11111111-1111-4111-8111-111111111111"],
        expiresAt: "2026-12-31T00:00:00.000Z",
        secret: "admin-secret-value",
      }),
    });
    const patchRes = await app.request(`/admin/vouchers/${voucherId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "inactive", secret: "admin-secret-value" }),
    });

    expect(createRes.status).toBe(500);
    expect(patchRes.status).toBe(500);
    await expect(createRes.json()).resolves.toMatchObject(expectApiError("Internal server error", "INTERNAL_SERVER_ERROR"));
    await expect(patchRes.json()).resolves.toMatchObject(expectApiError("Internal server error", "INTERNAL_SERVER_ERROR"));
    expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
      action: "voucher.create",
      outcome: "failure",
      actorId: "auth-user",
      targetType: "voucher",
      targetId: null,
      metadata: { error: "Voucher provider request failed" },
    }));
    expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
      action: "voucher.update",
      outcome: "failure",
      actorId: "auth-user",
      targetType: "voucher",
      targetId: voucherId,
      metadata: { error: "Voucher provider request failed" },
    }));
  });

  // Verifies voucher endpoints reject malformed identifiers, queries, and payloads.
  it("validates voucher route inputs", async () => {
    const [listRes, getRes, createRes, patchRes, searchRes] = await Promise.all([
      app.request("/admin/vouchers?limit=0"),
      app.request("/admin/vouchers/not-a-uuid"),
      app.request("/admin/vouchers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "WELCOME10" }),
      }),
      app.request("/admin/vouchers/not-a-uuid", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "inactive" }),
      }),
      app.request("/admin/vouchers/search-users?query=a&limit=0"),
    ]);

    expect(listRes.status).toBe(400);
    expect(getRes.status).toBe(400);
    expect(createRes.status).toBe(400);
    expect(patchRes.status).toBe(400);
    expect(searchRes.status).toBe(400);
    await expectValidationError(listRes, "Invalid voucher query");
    await expectValidationError(getRes, "Invalid voucher id");
    await expectValidationError(createRes, "Invalid voucher payload");
    await expectValidationError(patchRes, "Invalid voucher id");
    await expectValidationError(searchRes, "Invalid voucher search query");
  });

  // Verifies voucher lookup and redeem routes map success and failure responses correctly.
  it("routes voucher lookup miss and voucher redemption", async () => {
    mocks.vouchersService.getVoucherById.mockResolvedValueOnce({ success: false, error: "Voucher not found" });
    mocks.vouchersService.redeemVoucher.mockResolvedValueOnce({ success: true, creditsAdded: 25, newBalance: 40 });
    mocks.vouchersService.redeemVoucher.mockResolvedValueOnce({ success: false, error: "Voucher not found" });

    const missingRes = await app.request("/admin/vouchers/88888888-8888-4888-8888-888888888888");
    const redeemOkRes = await app.request("/me/vouchers/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "welcome10" }),
    });
    const redeemFailRes = await app.request("/me/vouchers/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "missing" }),
    });

    expect(missingRes.status).toBe(404);
    expect(redeemOkRes.status).toBe(200);
    expect(redeemFailRes.status).toBe(400);
    expect(mocks.vouchersService.redeemVoucher).toHaveBeenNthCalledWith(1, "auth-user", "welcome10");
    expect(mocks.vouchersService.redeemVoucher).toHaveBeenNthCalledWith(2, "auth-user", "missing");
    await expect(redeemOkRes.json()).resolves.toEqual({ success: true, creditsAdded: 25, newBalance: 40 });
    await expect(redeemFailRes.json()).resolves.toMatchObject(expectApiError("Voucher not found"));
  });

  // Verifies voucher redeem payload validation happens before the service call.
  it("validates voucher redeem payload", async () => {
    const res = await app.request("/me/vouchers/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    await expectValidationError(res, "Invalid voucher payload");
  });

  // Verifies notification list and dispatch routes map to service calls.
  it("routes notifications endpoints", async () => {
    mocks.notificationsService.getAllNotifications.mockResolvedValueOnce([{ id: "n1" }]);
    mocks.notificationsService.sendNotificationToAllUsers.mockResolvedValueOnce({
      sentCount: 5,
      skippedCount: 0,
      invalidRecipientCount: 0,
      invalidRecipientIds: [],
    });
    mocks.notificationsService.sendNotificationToUsers.mockResolvedValueOnce({
      sentCount: 2,
      skippedCount: 1,
      invalidRecipientCount: 1,
      invalidRecipientIds: ["77777777-7777-4777-8777-777777777777"],
    });
    mocks.adminService.verifyAdminSecret.mockResolvedValue({ success: true });

    const listRes = await app.request("/admin/notifications?limit=10");
    const sendAllRes = await app.request("/admin/notifications/send-all", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "T", message: "M", secret: "admin-secret-value" }),
    });
    const sendUsersRes = await app.request("/admin/notifications/send-users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userIds: ["66666666-6666-4666-8666-666666666666"],
        title: "T",
        message: "M",
        secret: "admin-secret-value",
      }),
    });

    expect(listRes.status).toBe(200);
    expect(sendAllRes.status).toBe(200);
    expect(sendUsersRes.status).toBe(200);
    await expect(listRes.json()).resolves.toEqual({ success: true, data: [{ id: "n1" }] });
    await expect(sendAllRes.json()).resolves.toEqual({
      success: true,
      data: {
        sentCount: 5,
        skippedCount: 0,
        invalidRecipientCount: 0,
        invalidRecipientIds: [],
      },
    });
    await expect(sendUsersRes.json()).resolves.toEqual({
      success: true,
      data: {
        sentCount: 2,
        skippedCount: 1,
        invalidRecipientCount: 1,
        invalidRecipientIds: ["77777777-7777-4777-8777-777777777777"],
      },
    });
  });

  it("records audit entries for notification sends", async () => {
    mocks.notificationsService.sendNotificationToAllUsers.mockResolvedValueOnce({
      sentCount: 3,
      skippedCount: 0,
      invalidRecipientCount: 0,
      invalidRecipientIds: [],
      batchId: "11111111-1111-4111-8111-111111111111",
    });
    mocks.adminService.verifyAdminSecret.mockResolvedValue({ success: true });

    const res = await app.request("/admin/notifications/send-all", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Ops", message: "Maintenance", secret: "admin-secret-value" }),
    });

    expect(res.status).toBe(200);
    expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
      action: "notification.send_all",
      outcome: "success",
      actorId: "auth-user",
      targetType: "notification_batch",
      targetId: "11111111-1111-4111-8111-111111111111",
      after: expect.objectContaining({
        title: "Ops",
        message: "Maintenance",
        scope: "all",
        type: "info",
        category: "system",
        showAsBanner: false,
      }),
      metadata: expect.objectContaining({ sentCount: 3 }),
    }));

    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { sentCount: 3, skippedCount: 0, invalidRecipientCount: 0, invalidRecipientIds: [] },
    });
  });

  it("routes notification send history", async () => {
    mocks.auditService.listAuditEntries.mockResolvedValueOnce([
      {
        id: "audit-1",
        action: "notification.send_users",
        actorId: "auth-user",
        targetId: "11111111-1111-4111-8111-111111111111",
        after: { title: "Hello", message: "World", scope: "selected" },
        metadata: { sentCount: 2, skippedCount: 1, invalidRecipientCount: 1, invalidRecipientIds: ["missing-user"] },
        createdAt: new Date("2026-04-27T10:00:00Z"),
      },
    ]);

    const res = await app.request("/admin/notifications/sends?limit=25");

    expect(res.status).toBe(200);
    expect(mocks.auditService.listAuditEntries).toHaveBeenCalledWith({ actionPrefix: "notification.", limit: 25 });
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: [expect.objectContaining({ id: "audit-1", title: "Hello", scope: "selected", sentCount: 2 })],
    });
  });

  it("routes notification user search", async () => {
    mocks.adminService.searchUsers.mockResolvedValueOnce([
      { id: "user-1", email: "a@example.com", name: "Ada" },
    ]);

    const res = await app.request("/admin/notifications/search-users?query=ada&limit=10");

    expect(res.status).toBe(200);
    expect(mocks.adminService.searchUsers).toHaveBeenCalledWith("ada", 10);
    expect(mocks.vouchersService.searchUsers).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: [{ id: "user-1", email: "a@example.com", name: "Ada" }],
    });
  });

  it("honors current user notification limit query", async () => {
    mocks.notificationsService.listForUser.mockResolvedValueOnce([{ id: "n-limited" }]);

    const res = await app.request("/me/notifications?limit=7");

    expect(res.status).toBe(200);
    expect(mocks.notificationsService.listForUser).toHaveBeenCalledWith("auth-user", 7);
    await expect(res.json()).resolves.toEqual({ success: true, data: [{ id: "n-limited" }] });
  });

  it("routes current user active banner lookup", async () => {
    mocks.notificationsService.getActiveBannerForUser.mockResolvedValueOnce({ id: "banner-1" });

    const res = await app.request("/me/notifications/active-banner");

    expect(res.status).toBe(200);
    expect(mocks.notificationsService.getActiveBannerForUser).toHaveBeenCalledWith("auth-user");
    await expect(res.json()).resolves.toEqual({ success: true, data: { id: "banner-1" } });
  });

  // Verifies malformed notification payloads now return 400 instead of 500.
  it("returns 400 when send-users payload is malformed", async () => {
    const res = await app.request("/admin/notifications/send-users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "x", message: "y" }),
    });

    expect(res.status).toBe(400);
    await expectValidationError(res, "Invalid notification payload");
  });

  // Verifies invoice endpoint rejects malformed payloads.
  it("validates invoice payload", async () => {
    const res = await app.request("/me/credits/invoice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    await expectValidationError(res, "Invalid invoice payload");
  });

  // Verifies invoice endpoint normalizes thrown service errors into 400 responses.
  it("maps invoice errors to 400 response", async () => {
    mocks.billingService.downloadInvoice.mockRejectedValueOnce(new Error("Unauthorized"));

    const res = await app.request("/me/credits/invoice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentId: "pay_1" }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject(expectApiError("Unauthorized"));
    expect(mocks.billingService.downloadInvoice).toHaveBeenCalledWith("auth-user", "pay_1");
  });

  // Verifies invoice endpoint returns successful invoice payload unchanged.
  it("returns invoice payload on success", async () => {
    mocks.billingService.downloadInvoice.mockResolvedValueOnce({
      success: true,
      invoiceUrl: "https://invoices.test/file.pdf",
    });

    const res = await app.request("/me/credits/invoice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentId: "pay_2" }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      invoiceUrl: "https://invoices.test/file.pdf",
    });
  });

  // Verifies checkout rejects unknown package keys with a validation error.
  it("rejects checkout for unknown package key", async () => {
    const res = await app.request("/payments/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packageKey: "not-a-package" }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject(expectApiError("Unknown package"));
  });

  // Verifies client log endpoint rejects malformed payloads.
  it("rejects malformed client log payload", async () => {
    const res = await app.request("/logs/client", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ level: "oops", message: "" }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject(expectApiError("Invalid log payload", "VALIDATION_FAILED"));
  });

  // Verifies client log endpoint accepts minimal valid payloads.
  it("accepts valid client log payload", async () => {
    const res = await app.request("/logs/client", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ level: "info", message: "client mounted" }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, data: { accepted: true } });
  });

  it("rejects invalid admin log entry file names with validation error", async () => {
    const res = await app.request("/admin/logs/entries?file=../bad");

    expect(res.status).toBe(400);
    await expectValidationError(res, "Invalid log entries query");
  });

  // Verifies client log endpoint redacts common secrets before writing logs.
  it("redacts sensitive client log metadata", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const res = await app.request("/logs/client", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        level: "info",
        message: "failed with Bearer abc.def.ghi",
        url: "https://app.test/callback?token=secret-token&safe=1",
        context: {
          password: "super-secret",
          nested: { authorization: "Bearer abc.def.ghi" },
        },
      }),
    });

    expect(res.status).toBe(200);
    const output = infoSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("[redacted]");
    expect(output).not.toContain("super-secret");
    expect(output).not.toContain("secret-token");
    expect(output).not.toContain("abc.def.ghi");
    infoSpy.mockRestore();
  });

  // Verifies JSON-like and colon-style secrets in client strings are redacted.
  it("redacts colon-style secrets in client log strings", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const res = await app.request("/logs/client", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        level: "info",
        message: 'client payload {"token": abc123,"password": "password-secret"} password: "correct horse battery staple"',
        userAgent: "agent refreshToken: refresh-secret",
        context: {
          detail:
            "token: plain-secret accessToken: access-secret \"client_secret\" : bare-secret client_secret: 'single word secret' 'client_secret': 'single-secret'",
        },
      }),
    });

    expect(res.status).toBe(200);
    const output = infoSpy.mock.calls.map((call) => String(call[0])).find((line) => line.includes("client payload")) ?? "";
    expect(output).toContain('\\"token\\": [redacted]');
    expect(output).toContain('\\"password\\": \\"[redacted]\\"');
    expect(output).toContain('\\"client_secret\\" : [redacted]');
    expect(output).toContain("'client_secret': '[redacted]'");
    expect(output).toContain("refreshToken: [redacted]");
    expect(output).toContain("accessToken: [redacted]");
    expect(output).toContain('password: \\\"[redacted]\\\"');
    expect(output).toContain("client_secret: '[redacted]'");
    expect(output).not.toContain("abc123");
    expect(output).not.toContain("password-secret");
    expect(output).not.toContain("correct horse battery staple");
    expect(output).not.toContain("horse battery staple");
    expect(output).not.toContain("refresh-secret");
    expect(output).not.toContain("plain-secret");
    expect(output).not.toContain("access-secret");
    expect(output).not.toContain("bare-secret");
    expect(output).not.toContain("single word secret");
    expect(output).not.toContain("word secret");
    expect(output).not.toContain("single-secret");
    infoSpy.mockRestore();
  });

  // Verifies unquoted multi-token secrets do not leak trailing tokens.
  it("redacts unquoted multi-token secret assignments in client log strings", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const res = await app.request("/logs/client", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        level: "info",
        message: "client payload Authorization: Basic abc123",
        userAgent: "agent password: correct horse battery",
        context: {
          detail: "client_secret = correct horse battery token: plain-secret",
        },
      }),
    });

    expect(res.status).toBe(200);
    const output = infoSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("Authorization: [redacted]");
    expect(output).toContain("password: [redacted]");
    expect(output).toContain("client_secret = [redacted]");
    expect(output).toContain("token: [redacted]");
    expect(output).not.toContain("Basic abc123");
    expect(output).not.toContain("correct horse");
    expect(output).not.toContain("horse battery");
    expect(output).not.toContain("plain-secret");
    infoSpy.mockRestore();
  });

  // Verifies free-form client strings redact sensitive key/value assignments with spaced equals signs.
  it("redacts whitespace-tolerant secret assignments in client log strings", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const res = await app.request("/logs/client", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        level: "info",
        message: 'client_secret = "multi word secret"',
        userAgent: "agent password = 'correct horse battery staple'",
        context: {
          detail: "clientSecret = def456",
        },
      }),
    });

    expect(res.status).toBe(200);
    const output = infoSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("client_secret = [redacted]");
    expect(output).toContain("password = [redacted]");
    expect(output).toContain("clientSecret = [redacted]");
    expect(output).not.toContain("multi word secret");
    expect(output).not.toContain("word secret");
    expect(output).not.toContain("correct horse battery staple");
    expect(output).not.toContain("horse battery staple");
    expect(output).not.toContain("def456");
    infoSpy.mockRestore();
  });

  // Verifies quoted sensitive keys are redacted for equals assignments too.
  it("redacts quoted equals secret assignments in client log strings", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const res = await app.request("/logs/client", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        level: "info",
        message: 'client payload "password" = "secret value"',
        userAgent: 'agent "client_secret" = bare-secret',
        context: {
          detail: '\\"password\\"=\\"secret value\\"',
        },
      }),
    });

    expect(res.status).toBe(200);
    const output = infoSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain('\\"password\\" = [redacted]');
    expect(output).toContain('\\"client_secret\\" = [redacted]');
    expect(output).toContain('\\\\\\"password\\\\\\"=[redacted]');
    expect(output).not.toContain("secret value");
    expect(output).not.toContain("bare-secret");
    infoSpy.mockRestore();
  });

  // Verifies escaped quote delimiters do not terminate redaction early.
  it("redacts escaped delimiter secrets in client log strings", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const res = await app.request("/logs/client", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        level: "info",
        message: 'client payload {"password":"abc\\"def"} password: "abc\\"def"',
        userAgent: "agent api_key = 'abc\\'def'",
        context: {
          detail: "client_secret: 'abc\\'def'",
        },
      }),
    });

    expect(res.status).toBe(200);
    const output = infoSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain('\\"password\\":\\"[redacted]\\"');
    expect(output).toContain('password: \\"[redacted]\\"');
    expect(output).toContain("api_key = [redacted]");
    expect(output).toContain("client_secret: '[redacted]'");
    expect(output).not.toContain("abc}def");
    infoSpy.mockRestore();
  });

  // Verifies structural delimiters inside quoted secret values are not treated as value boundaries.
  it("redacts quoted secret values containing structural delimiters in client log strings", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const res = await app.request("/logs/client", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        level: "info",
        message: 'client payload password: "abc}def" {"password":"abc}def"}',
        userAgent: String.raw`agent client_secret = 'abc}def' \"password\":\"abc}def\"`,
        context: {
          detail: 'password: "abc}def"',
        },
      }),
    });

    expect(res.status).toBe(200);
    const output = infoSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain('password: \\"[redacted]\\"');
    expect(output).toContain('\\"password\\":\\"[redacted]\\"');
    expect(output).toContain('\\\\\\"password\\\\\\":\\\\\\"[redacted]\\\\\\"');
    expect(output).toContain("client_secret = [redacted]");
    expect(output).not.toContain('password: \\"abc');
    expect(output).not.toContain('\\"password\\":\\"abc');
    expect(output).not.toContain("client_secret = abc");
    expect(output).not.toContain("def");
    infoSpy.mockRestore();
  });

  // Verifies serialized escaped quote delimiters inside values do not end redaction early.
  it("redacts serialized escaped-quote client log strings without leaking suffix tokens", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const res = await app.request("/logs/client", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        level: "info",
        message: String.raw`client payload \"password\":\"abc\\\"def\"`,
        userAgent: String.raw`agent \"password\"=\"abc\\\"def\"`,
        context: {
          detail: String.raw`\'client_secret\':\'abc\\\'def\'`,
        },
      }),
    });

    expect(res.status).toBe(200);
    const output = infoSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain('\\\\\\"password\\\\\\":\\\\\\"[redacted]\\\\\\"');
    expect(output).toContain('\\\\\\"password\\\\\\"=[redacted]');
    expect(output).toContain("\\\\'client_secret\\\\':\\\\'[redacted]\\\\'");
    expect(output).not.toContain('\\\\\\"password\\\\\\":\\\\\\"abc');
    expect(output).not.toContain('\\\\\\"password\\\\\\"=\\"abc');
    expect(output).not.toContain("\\\\'client_secret\\\\':\\\\'abc");
    expect(output).not.toContain("def");
    infoSpy.mockRestore();
  });

  // Verifies malformed quoted assignments do not leak remaining secret tokens.
  it("redacts unterminated quoted secrets in client log strings", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const res = await app.request("/logs/client", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        level: "info",
        message: 'client payload {"password":"first second} password = "first second',
        userAgent: 'agent password: "first second',
        context: {
          detail: '"client_secret" : "first second',
        },
      }),
    });

    expect(res.status).toBe(200);
    const output = infoSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain('\\"password\\":[redacted]');
    expect(output).toContain("password = [redacted]");
    expect(output).toContain("password: [redacted]");
    expect(output).toContain('\\"client_secret\\" : [redacted]');
    expect(output).not.toContain("first");
    expect(output).not.toContain("second");
    infoSpy.mockRestore();
  });

  // Verifies client error logs stay sanitized when written through the local logger.
  it("logs sanitized bounded client log context locally", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const wideContext = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`extra${index}`, `value${index}`]));

    const payload = {
      source: "web",
      level: "error",
      message: "failed with token=abc123 and bearer Bearer abc.def.ghi",
      url: "https://example.com/path?token=abc&safe=yes",
      userAgent: "Vitest",
      context: {
        safe: "ok",
        password: "secret",
        longValue: "x".repeat(600),
        nested: { authorization: "Bearer abc.def.ghi", safe: "ok" },
        ...wideContext,
      },
      timestamp: new Date().toISOString(),
    };

    const res = await app.request("/logs/client", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    const output = errorSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).not.toContain("abc.def.ghi");
    expect(output).not.toContain("token=abc");
    expect(output).toContain('"password":"[redacted]"');
    expect(output).toContain('"authorization":"[redacted]"');
    expect(output).toContain('"safe":"ok"');
    errorSpy.mockRestore();
  });

  // Verifies guarded endpoints reject oversized bodies before route parsing.
  it("rejects oversized checkout payloads", async () => {
    const res = await app.request("/payments/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packageKey: "starter", padding: "x".repeat(9 * 1024) }),
    });

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({
      ...expectApiError("Payload too large", "PAYLOAD_TOO_LARGE"),
    });
  });

  // Verifies guarded endpoints return stable rate-limit envelopes.
  it("rate limits voucher redemption", async () => {
    mocks.vouchersService.redeemVoucher.mockResolvedValue({ success: true, data: { credits: 10 } });
    let res = new Response();
    for (let i = 0; i < 21; i += 1) {
      res = await app.request("/me/vouchers/redeem", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
        body: JSON.stringify({ code: "WELCOME" }),
      });
    }

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    await expect(res.json()).resolves.toMatchObject({
      ...expectApiError("Too many requests", "RATE_LIMITED"),
    });
  });

  // Verifies discount code generation endpoint maps service errors to 400 responses.
  it("maps generate-code failures to 400", async () => {
    mocks.discountsService.generateDiscountCode.mockRejectedValueOnce(new Error("generator failed"));

    const res = await app.request("/admin/discounts/generate-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ overridePrefix: "PROMO" }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject(expectApiError("generator failed"));
  });

  // Verifies discount code generation endpoint returns generated code on success.
  it("returns generated discount code", async () => {
    mocks.discountsService.generateDiscountCode.mockResolvedValueOnce("PROMO-AAA-BBBB");

    const res = await app.request("/admin/discounts/generate-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ overridePrefix: "PROMO" }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, data: { code: "PROMO-AAA-BBBB" } });
  });

  // Verifies discount lookup endpoint validates malformed identifiers.
  it("validates discount identifiers", async () => {
    const res = await app.request("/admin/discounts/missing");

    expect(res.status).toBe(400);
    await expectValidationError(res, "Invalid discount id");
  });

  // Verifies discount lookup endpoint returns 404 when service reports missing discount.
  it("returns 404 for missing discount by id", async () => {
    mocks.discountsService.getDiscountById.mockResolvedValueOnce({ success: false, discount: null, error: "Discount not found" });

    const res = await app.request("/admin/discounts/11111111-1111-4111-8111-111111111111");

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject(expectApiError("Discount not found", "NOT_FOUND"));
  });

  // Verifies discount validation endpoint passes excludeId and code to service.
  it("forwards discount validation payload to service", async () => {
    mocks.discountsService.validateDiscountCode.mockResolvedValueOnce({ valid: true });

    const res = await app.request("/admin/discounts/validate-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "SAVE10", excludeId: "11111111-1111-4111-8111-111111111111" }),
    });

    expect(res.status).toBe(200);
    expect(mocks.discountsService.validateDiscountCode).toHaveBeenCalledWith("SAVE10", "11111111-1111-4111-8111-111111111111");
  });

  // Verifies POST /me/credits/consume successfully consumes credits and returns result.
  it("consumes credits and returns transaction result", async () => {
    mocks.billingService.consumeCredits.mockResolvedValueOnce({
      transactionId: "tx-1",
      idempotencyKey: "idem-key-12345678",
      balanceBefore: "100.00",
      balanceAfter: "95.00",
      alreadyProcessed: false,
    });

    const res = await app.request("/me/credits/consume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        featureKey: "ai-query",
        amount: 5,
        idempotencyKey: "idem-key-12345678",
      }),
    });

    expect(res.status).toBe(200);
    expect(mocks.billingService.consumeCredits).toHaveBeenCalledWith("auth-user", {
      featureKey: "ai-query",
      amount: 5,
      idempotencyKey: "idem-key-12345678",
    });
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: {
        transactionId: "tx-1",
        idempotencyKey: "idem-key-12345678",
        balanceBefore: "100.00",
        balanceAfter: "95.00",
        alreadyProcessed: false,
      },
    });
  });

  // Verifies POST /me/credits/consume returns 400 when service throws (e.g. insufficient credits).
  it("returns 400 when consuming credits fails", async () => {
    mocks.billingService.consumeCredits.mockRejectedValueOnce(new Error("Insufficient credits"));

    const res = await app.request("/me/credits/consume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        featureKey: "ai-query",
        amount: 1000,
        idempotencyKey: "idem-key-12345678",
      }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      ...expectApiError("Insufficient credits"),
    });
  });

  // Verifies POST /me/credits/consume validates the request body.
  it("validates consume credits payload", async () => {
    const res = await app.request("/me/credits/consume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ featureKey: "ai-query" }),
    });

    expect(res.status).toBe(400);
    await expectValidationError(res, "Invalid credit usage payload");
    expect(mocks.billingService.consumeCredits).not.toHaveBeenCalled();
  });

});
