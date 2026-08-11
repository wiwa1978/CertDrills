import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const authState = {
    allowAuth: false,
    allowAdmin: false,
    allowAdminAccess: false,
    twoFactorEnabled: true,
    useRealmCookies: false,
    impersonating: false,
    adminRequireAuthCalls: 0,
    adminRequireAccessCalls: 0,
  };

  const adminService = {
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
    verifyAdminSecret: vi.fn(),
  };

  const billingService = {
    getCreditBalance: vi.fn(),
    getCreditHistory: vi.fn(),
    getCreditPurchases: vi.fn(),
    getUserByEmail: vi.fn(),
    processCreditPurchase: vi.fn(),
    downloadInvoice: vi.fn(),
  };

  const transactionService = {
    getOrCreateDraftBasket: vi.fn().mockResolvedValue({ id: "basket-1", status: "draft", currency: null, totalAmount: 0, items: [] }),
    upsertBasketItem: vi.fn().mockResolvedValue({ id: "basket-1", status: "draft", currency: "EUR", totalAmount: 500, items: [] }),
    removeBasketItem: vi.fn().mockResolvedValue({ id: "basket-1", status: "draft", currency: null, totalAmount: 0, items: [] }),
    clearBasket: vi.fn().mockResolvedValue({ id: "basket-1", status: "draft", currency: null, totalAmount: 0, items: [] }),
    checkoutBasket: vi.fn().mockResolvedValue({ checkoutUrl: "https://checkout.test/order-1", orderId: "order-1" }),
    handleTransactionPayment: vi.fn(),
    processTransactionRefund: vi.fn(),
    createTransactionRefund: vi.fn(),
    listOrders: vi.fn().mockResolvedValue([]),
    getOrder: vi.fn().mockResolvedValue({
      id: "order-1",
      status: "paid",
      currency: "EUR",
      subtotalAmount: 500,
      taxAmount: 0,
      totalAmount: 500,
      paymentId: "pay_1",
      createdAt: "2026-08-03T00:00:00.000Z",
      items: [],
    }),
    listEntitlements: vi.fn().mockResolvedValue([]),
    consumeEntitlement: vi.fn().mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      productKey: "starterContent",
      status: "consumed",
      orderId: "order-1",
      consumedAt: "2026-08-03T00:00:00.000Z",
      createdAt: "2026-08-03T00:00:00.000Z",
    }),
  };

  const notificationsService = {
    listForUser: vi.fn(),
    unreadCount: vi.fn(),
    markAsRead: vi.fn(),
    deleteNotification: vi.fn(),
    markAllAsRead: vi.fn(),
    getAllNotifications: vi.fn(),
    sendNotificationToAllUsers: vi.fn(),
    sendNotificationToUsers: vi.fn(),
    createNotification: vi.fn(),
  };
  const adminTransactionFinanceDashboardService = {
    getDashboard: vi.fn(),
  };

  return {
    authState,
    adminService,
    billingService,
    transactionService,
    notificationsService,
    adminTransactionFinanceDashboardService,
    env: {
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/test",
      APP_URL: "http://localhost:3100",
      API_URL: "http://localhost:8787",
      ADMIN_ALLOWLIST: "admin@example.com",
      ADMIN_APP_URL: "http://localhost:3101",
      ADMIN_PORTAL_TOTP_REQUIRED: false,
      DODO_PAYMENTS_ENVIRONMENT: "test_mode" as const,
      BETTER_AUTH_SECRET: "this-is-a-long-enough-secret",
      JWT_SECRET: "this-is-a-long-enough-jwt-secret",
      JWT_ISSUER: "api",
      JWT_AUDIENCE: "mobile-clients",
      JWT_ACCESS_TTL_SECONDS: 900,
      JWT_REFRESH_TTL_SECONDS: 2592000,
      COOKIE_SAMESITE: "lax" as const,
      NODE_ENV: "test" as const,
      INNGEST_APP_ID: "api-authz-test",
      AZURE_PRIVACY_EXPORT_STORAGE_CONNECTION_STRING: "UseDevelopmentStorage=true",
      AZURE_PRIVACY_EXPORT_STORAGE_CONTAINER: "privacy-exports",
    },
  };
});

vi.mock("../src/env", () => ({ env: mocks.env }));

vi.mock("@platform/auth-core", () => {
  return {
    authAdditionalUserFields: {},
    createAuthModule: (options: any) => {
      const cookiePrefix = options.betterAuthOptions.advanced.cookiePrefix as string;
      const isAdminRealm = cookiePrefix === "better-auth-admin";
      const hasAdminPlugin = options.betterAuthOptions.plugins.some((plugin: { id?: string }) => plugin.id === "admin");
      const rawAdminRouter = new Hono();
      if (hasAdminPlugin) {
        rawAdminRouter.post("/admin/set-role", (c) => c.json({ success: true, realm: isAdminRealm ? "admin" : "public" }));
      }

      function hasRealmCookie(c: any) {
        return (c.req.header("cookie") ?? "").includes(`${cookiePrefix}.session_token=`);
      }

      return {
        router: rawAdminRouter,
        sessionRouter: new Hono(),
        mobileRouter: new Hono(),
        requireAuth: async (c: any, next: any) => {
          if (isAdminRealm) mocks.authState.adminRequireAuthCalls += 1;
          if (mocks.authState.useRealmCookies ? !hasRealmCookie(c) : !mocks.authState.allowAuth) {
            return c.json({ success: false, error: "Unauthorized" }, 401);
          }
          c.set("authUser", {
            id: mocks.authState.impersonating ? "target-user" : mocks.authState.useRealmCookies ? (isAdminRealm ? "admin-user" : "public-user") : "u1",
            role: mocks.authState.impersonating ? "user" : "admin",
            email: mocks.authState.impersonating ? "target@example.com" : "admin@example.com",
          });
          c.set("authSession", mocks.authState.impersonating ? { impersonatedBy: "admin-user" } : null);
          await next();
        },
        requireAdmin: async (c: any, next: any) => {
          if (!mocks.authState.allowAdmin) {
            return c.json({ success: false, error: "Forbidden" }, 403);
          }
          await next();
        },
        requireAdminAccess: async (c: any, next: any) => {
          if (isAdminRealm) mocks.authState.adminRequireAccessCalls += 1;
          if (mocks.authState.impersonating && isAdminRealm && hasRealmCookie(c)) {
            await next();
            return;
          }
          if (mocks.authState.useRealmCookies ? !isAdminRealm || !hasRealmCookie(c) : !mocks.authState.allowAdminAccess) {
            return c.json({ success: false, error: "Forbidden" }, 403);
          }
          await next();
        },
        auth: {
          api: {
            getSession: async () => ({ user: { twoFactorEnabled: mocks.authState.useRealmCookies ? isAdminRealm : mocks.authState.twoFactorEnabled } }),
            verifyTotp: async () => null,
            stopImpersonating: async () => new Response(JSON.stringify({ success: true }), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
          },
        },
      };
    },
  };
});

vi.mock("@platform/payments-core", () => ({
  createPaymentWebhookIngestion: () => ({ ingestVerifiedPayload: vi.fn() }),
  createPaymentsModule: () => ({ router: new Hono() }),
  mapDodoEvent: vi.fn(),
}));
vi.mock("../src/modules/security/postgres-rate-limit-store", () => ({
  createPostgresRateLimitStore: () => ({
    consume: vi.fn(async (_key: string, rule: { max: number; windowMs: number }) => ({ allowed: true, remaining: rule.max - 1, retryAfterSeconds: Math.ceil(rule.windowMs / 1000) })),
    cleanupExpired: vi.fn(async () => 0),
  }),
}));

vi.mock("@platform/platform-db", () => ({
  account: {},
  apiKeys: {},
  auditEntries: {},
  checkoutIntents: {},
  creditPurchases: {},
  creditTransactions: {},
  createPlatformDb: () => ({ db: {} }),
  applicationSettings: {},
  jobRuns: {},
  jobs: {},
  mobileRefreshToken: {},
  notification: {},
  pendingEmails: {},
  rateLimitBuckets: {},
  session: {},
  subscriptionPayments: {},
  transactionBasketItems: {},
  transactionBaskets: {},
  transactionEntitlements: {},
  transactionOrderItems: {},
  transactionOrders: {},
  user: {},
  userCredits: {},
  userDataExportRequests: {},
  userDiscounts: {},
  userSubscriptions: {},
  voucherAssignments: {},
  voucherRedemptions: {},
}));
vi.mock("@platform/email-core", () => ({ createEmailModule: () => ({ sendTemplate: vi.fn() }), createResendProvider: () => ({ send: vi.fn() }) }));
vi.mock("../src/modules/billing/service", () => ({ createBillingService: () => mocks.billingService }));
vi.mock("../src/modules/billing/transaction-service", () => ({ createTransactionService: () => mocks.transactionService }));
vi.mock("../src/modules/billing/transaction-finance-dashboard-service", () => ({
  createAdminTransactionFinanceDashboardService: () => mocks.adminTransactionFinanceDashboardService,
}));
vi.mock("../src/modules/admin/service", () => ({ createAdminService: () => mocks.adminService }));
vi.mock("../src/modules/discounts/service", () => ({
  createDiscountsService: () => ({
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
  }),
}));
vi.mock("../src/modules/notifications/service", () => ({ createNotificationsService: () => mocks.notificationsService }));

const { app } = await import("../src/app");
const { applicationConfig } = await import("../src/config/application");

describe("authz contract", () => {
  beforeEach(() => {
    mocks.authState.allowAuth = false;
    mocks.authState.allowAdmin = false;
    mocks.authState.allowAdminAccess = false;
    mocks.authState.twoFactorEnabled = true;
    mocks.authState.useRealmCookies = false;
    mocks.authState.impersonating = false;
    mocks.authState.adminRequireAuthCalls = 0;
    mocks.authState.adminRequireAccessCalls = 0;
    (applicationConfig as { billing: { mode: "credits" | "subscriptions" | "transactions" } }).billing.mode = "credits";
    vi.clearAllMocks();
    mocks.transactionService.getOrCreateDraftBasket.mockResolvedValue({ id: "basket-1", status: "draft", currency: null, totalAmount: 0, items: [] });
    mocks.transactionService.upsertBasketItem.mockResolvedValue({ id: "basket-1", status: "draft", currency: "EUR", totalAmount: 500, items: [] });
    mocks.transactionService.removeBasketItem.mockResolvedValue({ id: "basket-1", status: "draft", currency: null, totalAmount: 0, items: [] });
    mocks.transactionService.clearBasket.mockResolvedValue({ id: "basket-1", status: "draft", currency: null, totalAmount: 0, items: [] });
    mocks.transactionService.checkoutBasket.mockResolvedValue({ checkoutUrl: "https://checkout.test/order-1", orderId: "order-1" });
    mocks.transactionService.listOrders.mockResolvedValue([]);
    mocks.transactionService.getOrder.mockResolvedValue({
      id: "order-1",
      status: "paid",
      currency: "EUR",
      subtotalAmount: 500,
      taxAmount: 0,
      totalAmount: 500,
      paymentId: "pay_1",
      createdAt: "2026-08-03T00:00:00.000Z",
      items: [],
    });
    mocks.transactionService.listEntitlements.mockResolvedValue([]);
    mocks.transactionService.consumeEntitlement.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      productKey: "starterContent",
      status: "consumed",
      orderId: "order-1",
      consumedAt: "2026-08-03T00:00:00.000Z",
      createdAt: "2026-08-03T00:00:00.000Z",
    });
  });

  // Ensures user-scoped routes hard-fail when no authenticated identity is present.
  it("rejects /me routes without auth", async () => {
    const res = await app.request("/me/credits/balance");
    expect(res.status).toBe(401);
  });

  // Ensures admin routes cannot be reached by authenticated non-admin users.
  it("rejects /admin routes without admin rights", async () => {
    mocks.authState.allowAuth = true;
    const res = await app.request("/admin/status");
    expect(res.status).toBe(403);
  });

  it("rejects the transaction finance dashboard for a non-admin before calling its service", async () => {
    mocks.authState.allowAuth = true;
    (applicationConfig as { billing: { mode: "credits" | "subscriptions" | "transactions" } }).billing.mode = "transactions";

    const res = await app.request("/admin/billing/transaction-dashboard");

    expect(res.status).toBe(403);
    expect(mocks.adminTransactionFinanceDashboardService.getDashboard).not.toHaveBeenCalled();
  });

  // Ensures privileged admin routes cannot be reached by lower-privilege identities.
  it("rejects /admin routes without allowlisted admin access", async () => {
    mocks.authState.allowAuth = true;
    const res = await app.request("/admin/status");
    expect(res.status).toBe(403);
  });

  // Ensures admin route works when all required guards are satisfied.
  it("allows /admin/status with required privileges", async () => {
    mocks.authState.allowAuth = true;
    mocks.authState.allowAdminAccess = true;

    const res = await app.request("/admin/status");

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

  // Ensures admin dashboard endpoint enforces allowlisted admin access and returns delegated data.
  it("guards and serves /admin/dashboard/stats", async () => {
    mocks.adminService.getDashboardStats.mockResolvedValueOnce({ totalUsers: 10 });

    const forbidden = await app.request("/admin/dashboard/stats");
    expect(forbidden.status).toBe(401);

    mocks.authState.allowAuth = true;
    const stillForbidden = await app.request("/admin/dashboard/stats");
    expect(stillForbidden.status).toBe(403);

    mocks.authState.allowAdminAccess = true;
    const ok = await app.request("/admin/dashboard/stats");
    expect(ok.status).toBe(200);
    await expect(ok.json()).resolves.toEqual({ success: true, data: { totalUsers: 10 } });
  });

  // Ensures raw Better Auth admin plugin endpoints remain available to allowlisted admins.
  it("keeps public admin plugin routes guarded and available", async () => {
    const unauthenticated = await app.request("/auth/admin/set-role", { method: "POST" });
    expect(unauthenticated.status).toBe(401);

    mocks.authState.allowAuth = true;
    const unauthorized = await app.request("/auth/admin/set-role", { method: "POST" });
    expect(unauthorized.status).toBe(403);

    mocks.authState.allowAdminAccess = true;
    const res = await app.request("/auth/admin/set-role", { method: "POST" });

    expect(res.status).toBe(200);
  });

  it("isolates public and admin routes when both realm cookies are present", async () => {
    mocks.authState.useRealmCookies = true;
    const headers = { cookie: "better-auth.session_token=public-token; better-auth-admin.session_token=admin-token" };

    const [status, publicSession, adminSession] = await Promise.all([
      app.request("/admin/status", { headers }),
      app.request("/me/session", { headers }),
      app.request("/admin/me/session", { headers }),
    ]);

    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toMatchObject({ data: { twoFactorEnabled: true } });
    await expect(publicSession.json()).resolves.toMatchObject({ data: { id: "public-user" } });
    await expect(adminSession.json()).resolves.toMatchObject({ data: { id: "admin-user" } });
  });

  it("does not authorize admin routes with only the public cookie", async () => {
    mocks.authState.useRealmCookies = true;
    const headers = {
      cookie: "better-auth.session_token=public-token",
      origin: "http://localhost:3101",
    };

    const [status, adminMe, plugin] = await Promise.all([
      app.request("/admin/status", { headers }),
      app.request("/admin/me/session", { headers }),
      app.request("/admin-auth/admin/set-role", { method: "POST", headers }),
    ]);

    expect(status.status).toBe(401);
    expect(adminMe.status).toBe(401);
    expect(plugin.status).toBe(401);
  });

  it("guards generic admin auth plugin routes with the admin realm", async () => {
    mocks.authState.useRealmCookies = true;

    const res = await app.request("/admin-auth/admin/set-role", {
      method: "POST",
      headers: {
        cookie: "better-auth-admin.session_token=admin-token",
        origin: "http://localhost:3101",
      },
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ realm: "admin" });
  });

  it("requires admin authentication for the custom stop impersonation route", async () => {
    const res = await app.request("/admin-auth/admin/stop-impersonating", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3101",
      },
      body: "{}",
    });

    expect(res.status).toBe(401);
  });

  it("allows an impersonated admin shell, blocks mutations, and permits stopping impersonation", async () => {
    mocks.authState.useRealmCookies = true;
    mocks.authState.impersonating = true;
    const headers = {
      cookie: "better-auth-admin.session_token=admin-token",
      origin: "http://localhost:3101",
    };

    const status = await app.request("/admin/status", { headers });
    const personalRead = await app.request("/admin/me/session", { headers });
    const personalMutation = await app.request("/admin/me/vouchers/redeem", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ code: "TEST" }),
    });
    const checkout = await app.request("/admin/payments/checkout", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ packageKey: "advanced" }),
    });
    const privilegedMutation = await app.request("/admin/users/revoke-sessions", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ userId: "target-user", secret: "secret" }),
    });
    const pluginMutation = await app.request("/admin-auth/admin/set-role", {
      method: "POST",
      headers,
    });
    const stop = await app.request("/admin-auth/admin/stop-impersonating", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: "{}",
    });

    expect(status.status).toBe(200);
    expect(personalRead.status).toBe(200);
    expect(personalMutation.status).toBe(403);
    expect(checkout.status).toBe(403);
    expect(privilegedMutation.status).toBe(403);
    expect(pluginMutation.status).toBe(403);
    expect(stop.status).toBe(200);
  });

  it("resolves admin auth and access exactly once", async () => {
    mocks.authState.useRealmCookies = true;

    const res = await app.request("/admin/status", {
      headers: { cookie: "better-auth-admin.session_token=admin-token" },
    });

    expect(res.status).toBe(200);
    expect(mocks.authState.adminRequireAuthCalls).toBe(1);
    expect(mocks.authState.adminRequireAccessCalls).toBe(1);
  });

  it("expires the admin cookie after an admin auth access failure", async () => {
    mocks.authState.allowAuth = true;
    const res = await app.request("/admin-auth/admin/set-role", {
      method: "POST",
      headers: {
        cookie: "better-auth-admin.session_token=admin-token",
        origin: "http://localhost:3101",
      },
    });

    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toContain("better-auth-admin.session_token=");
    expect(res.headers.get("set-cookie")).not.toContain("better-auth.session_token=");
  });

  it.each([
    ["development", "better-auth-admin.session_token=", false],
    ["production", "__Secure-better-auth-admin.session_token=", true],
  ])("derives admin invalidation cookie security from NODE_ENV %s", async (nodeEnv, cookieName, secure) => {
    const previousNodeEnv = mocks.env.NODE_ENV;
    mocks.env.NODE_ENV = nodeEnv as "development" | "production" | "test";
    mocks.authState.allowAuth = true;

    const res = await app.request("/admin-auth/admin/set-role", {
      method: "POST",
      headers: {
        cookie: "better-auth-admin.session_token=admin-token",
        origin: "http://localhost:3101",
      },
    });

    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(cookieName);
    expect(cookie.includes("; Secure")).toBe(secure);
    expect(cookie).not.toContain("better-auth.session_token=");
    mocks.env.NODE_ENV = previousNodeEnv;
  });

  // Ensures credentialed admin APIs are not CORS-callable from the public app origin.
  it("does not allow public app origin CORS on admin APIs", async () => {
    const res = await app.request("/admin/status", {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3100",
        "access-control-request-method": "GET",
      },
    });

    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it.each(["/admin-auth", "/admin-auth/sign-in/email"])("classifies admin auth route %s as admin CORS", async (path) => {
    const res = await app.request(path, {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3100",
        "access-control-request-method": "POST",
      },
    });

    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("blocks cross-site cookie-authenticated unsafe requests", async () => {
    const res = await app.request("/admin/verify-admin-secret", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=session-token",
        origin: "https://evil.example.com",
      },
      body: JSON.stringify({ secret: "secret" }),
    });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Forbidden origin",
      },
    });
  });

  it("allows same-admin-origin cookie-authenticated unsafe requests", async () => {
    mocks.authState.allowAuth = true;
    mocks.authState.allowAdminAccess = true;
    mocks.adminService.verifyAdminSecret.mockResolvedValueOnce({ success: true });

    const res = await app.request("/admin/verify-admin-secret", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=session-token",
        origin: "http://localhost:3101",
      },
      body: JSON.stringify({ secret: "secret" }),
    });

    expect(res.status).toBe(200);
  });

  it("serves transaction billing user routes in transaction mode", async () => {
    mocks.authState.allowAuth = true;
    (applicationConfig as { billing: { mode: "credits" | "subscriptions" | "transactions" } }).billing.mode = "transactions";

    const basket = await app.request("/me/transaction-basket");
    expect(basket.status).toBe(200);
    await expect(basket.json()).resolves.toEqual({ success: true, data: { id: "basket-1", status: "draft", currency: null, totalAmount: 0, items: [] } });

    const upsert = await app.request("/me/transaction-basket/items", {
      method: "PUT",
      body: JSON.stringify({ productKey: "starterContent", quantity: 1 }),
      headers: { "content-type": "application/json" },
    });
    expect(upsert.status).toBe(200);
    expect(mocks.transactionService.upsertBasketItem).toHaveBeenCalledWith("u1", { productKey: "starterContent", quantity: 1 });

    const remove = await app.request("/me/transaction-basket/items/starterContent", { method: "DELETE" });
    expect(remove.status).toBe(200);
    expect(mocks.transactionService.removeBasketItem).toHaveBeenCalledWith("u1", "starterContent");

    const clear = await app.request("/me/transaction-basket", { method: "DELETE" });
    expect(clear.status).toBe(200);
    expect(mocks.transactionService.clearBasket).toHaveBeenCalledWith("u1");

    const checkout = await app.request("/me/transaction-basket/checkout", { method: "POST" });
    expect(checkout.status).toBe(200);
    await expect(checkout.json()).resolves.toEqual({ success: true, data: { checkoutUrl: "https://checkout.test/order-1", orderId: "order-1" } });

    const orders = await app.request("/me/transaction-orders");
    expect(orders.status).toBe(200);
    expect(mocks.transactionService.listOrders).toHaveBeenCalledWith("u1");

    const order = await app.request("/me/transaction-orders/order-1");
    expect(order.status).toBe(200);
    expect(mocks.transactionService.getOrder).toHaveBeenCalledWith("u1", "order-1");

    const entitlements = await app.request("/me/transaction-entitlements");
    expect(entitlements.status).toBe(200);
    expect(mocks.transactionService.listEntitlements).toHaveBeenCalledWith("u1");

    const consume = await app.request("/me/transaction-entitlements/00000000-0000-4000-8000-000000000001/consume", { method: "POST" });
    expect(consume.status).toBe(200);
    expect(mocks.transactionService.consumeEntitlement).toHaveBeenCalledWith("u1", "00000000-0000-4000-8000-000000000001");
  });

  it("does not expose provider details when transaction checkout fails", async () => {
    mocks.authState.allowAuth = true;
    (applicationConfig as { billing: { mode: "credits" | "subscriptions" | "transactions" } }).billing.mode = "transactions";
    mocks.transactionService.checkoutBasket.mockRejectedValue(new Error("Dodo checkout rejected product pdt_private"));

    const checkout = await app.request("/me/transaction-basket/checkout", { method: "POST" });

    expect(checkout.status).toBe(400);
    await expect(checkout.json()).resolves.toEqual({
      success: false,
      error: { code: "BAD_REQUEST", message: "Failed to create transaction checkout" },
      requestId: expect.any(String),
    });
  });

  it("returns 404 when a pending transaction order is hidden from customer history", async () => {
    mocks.authState.allowAuth = true;
    (applicationConfig as { billing: { mode: "credits" | "subscriptions" | "transactions" } }).billing.mode = "transactions";
    mocks.transactionService.getOrder.mockResolvedValueOnce(null);

    const hidden = await app.request("/me/transaction-orders/pending-order");

    expect(hidden.status).toBe(404);
    expect(mocks.transactionService.getOrder).toHaveBeenCalledWith("u1", "pending-order");

    const visible = await app.request("/me/transaction-orders/order-1");
    expect(visible.status).toBe(200);
  });

  it("rejects transaction billing user routes outside transaction mode", async () => {
    mocks.authState.allowAuth = true;
    (applicationConfig as { billing: { mode: "credits" | "subscriptions" | "transactions" } }).billing.mode = "credits";

    const res = await app.request("/me/transaction-basket");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: "BAD_REQUEST",
        message: "Billing mode disabled: transactions",
      },
    });
  });
});
