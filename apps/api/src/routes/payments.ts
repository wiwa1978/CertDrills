import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";

import { createCheckoutRequestSchema } from "@platform/contracts";
import { country } from "@platform/platform-db";

import type { AppEnv } from "../context";
import type { PlatformServices } from "../bootstrap";
import { creditPackages, subscriptionPlans } from "../config/billing";
import { env } from "../env";
import { badGateway, badRequest, unauthorized, parseJsonBody, validationError } from "../lib/http";
import { ensureCreditBillingEnabled, ensureSubscriptionBillingEnabled, getBillingModeDisabledErrorMessage } from "../lib/feature-guards";
import { logger } from "../observability/logger";

export { buildDodoCheckoutUrl } from "../lib/dodo-checkout";

export function createPaymentsRouter(services: PlatformServices) {
  const router = new Hono<AppEnv>();

  router.route("/payments", services.paymentsModule.router);
  router.route("/", createCheckoutRouter(services));

  router.get("/billing/reconcile", async (c) => {
    const secret = env.BILLING_RECONCILIATION_SECRET;
    const authorization = c.req.header("authorization");

    if (!secret || authorization !== `Bearer ${secret}`) {
      return unauthorized(c, "Unauthorized");
    }

    const result = await services.billingReconciliationService.reconcileProviderBillingStateSafely();
    return c.json({ success: true, data: services.billingReconciliationService.serializeResult(result) });
  });

  return router;
}

export function createCheckoutRouter(services: PlatformServices, options: {
  requireAuth?: MiddlewareHandler<AppEnv> | false;
  applicationUrl?: string;
} = {}) {
  const router = new Hono<AppEnv>();
  const applicationUrl = options.applicationUrl ?? env.APP_URL;

  function productIdForActiveProvider(product: { providerProductIds: Record<string, string>; key: string }) {
    const productId = product.providerProductIds[services.paymentProviders.activeProvider.name];
    if (!productId) {
      throw new Error(`No provider product configured for ${services.paymentProviders.activeProvider.name}:${product.key}`);
    }

    return productId;
  }

  const checkoutHandler = async (c: Context<AppEnv>) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(createCheckoutRequestSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid checkout payload");
    }

    const packageKey = "packageKey" in parsedBody.data ? parsedBody.data.packageKey : undefined;
    const planKey = "planKey" in parsedBody.data ? parsedBody.data.planKey : undefined;
    const discountCode = "discountCode" in parsedBody.data ? parsedBody.data.discountCode : undefined;
    const address = "address" in parsedBody.data ? parsedBody.data.address : undefined;
    const requestMode = "billingMode" in parsedBody.data ? parsedBody.data.billingMode : "credits";

    try {
      if (requestMode === "credits") {
        ensureCreditBillingEnabled();
      } else {
        ensureSubscriptionBillingEnabled();
      }
    } catch (error) {
      const billingModeError = getBillingModeDisabledErrorMessage(error);
      if (billingModeError) {
        return badRequest(c, billingModeError);
      }

      throw error;
    }

    const selectedProduct = requestMode === "credits"
      ? creditPackages.find((pkg) => pkg.key === packageKey)
      : subscriptionPlans.find((plan) => plan.key === planKey);
    if (!selectedProduct) {
      return badRequest(c, requestMode === "credits" ? "Unknown package" : "Unknown plan");
    }

    let productId: string;
    try {
      productId = productIdForActiveProvider(selectedProduct);
    } catch {
      return badRequest(c, "Selected product is not configured for the active payment provider");
    }

    const authUser = c.get("authUser");
    if (!authUser) {
      // requireAuth middleware should have prevented this, but be defensive.
      return unauthorized(c, "Unauthenticated");
    }

    const billingAddress = address
      ? await checkoutBillingAddress(services, address)
      : null;

    if (address && !billingAddress) {
      return badRequest(c, "Selected billing address is invalid");
    }

    const checkoutIntent = await services.checkoutIntentsService.create({
      userId: authUser.id,
      billingMode: requestMode,
      packageKey,
      planKey,
      productId,
      discountCode,
      metadata: {
        source: "payments.checkout",
      },
    });

    let checkoutUrl: string;
    try {
      checkoutUrl = await services.paymentProviders.activeProvider.createCheckoutUrl({
        productId,
        userId: authUser.id,
        billingMode: requestMode,
        ...(requestMode === "credits" ? { packageKey } : { planKey }),
        ...(discountCode ? { discountCode } : {}),
        referenceId: checkoutIntent.referenceId,
        customerEmail: authUser.email ?? null,
        billingAddress,
        ...(options.applicationUrl ? {
          successUrl: new URL("/billing?success=true", applicationUrl).toString(),
          cancelUrl: new URL("/billing?cancel=true", applicationUrl).toString(),
        } : {}),
      });
    } catch (error) {
      logger.error(
        {
          requestId: c.get("requestId"),
          userId: authUser.id,
          billingMode: requestMode,
          error,
        },
        "billing_checkout.create.failed",
      );
      return badGateway(c, "Failed to create checkout");
    }

    return c.json({ success: true, data: { checkoutUrl } });
  };

  const requireAuth = options.requireAuth === false
    ? async (_c: Context<AppEnv>, next: () => Promise<void>) => next()
    : options.requireAuth ?? services.authModule.requireAuth;
  router.post("/payments/checkout", requireAuth, checkoutHandler);

  return router;
}

async function checkoutBillingAddress(services: PlatformServices, address: {
  street: string;
  number: string;
  zipcode: string;
  town: string;
  countryId: string;
}) {
  const [selectedCountry] = await services.db
    .select({ code: country.code, name: country.name })
    .from(country)
    .where(eq(country.id, address.countryId))
    .limit(1);

  if (!selectedCountry) {
    return null;
  }

  return {
    street: address.street,
    number: address.number,
    zipcode: address.zipcode,
    town: address.town,
    countryCode: selectedCountry.code,
    countryName: selectedCountry.name,
  };
}
