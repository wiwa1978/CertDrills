import { Hono } from "hono";

import { createCheckoutRequestSchema } from "@platform/contracts";

import type { AppEnv } from "../context";
import { bootstrap } from "../bootstrap";
import { creditPackages, subscriptionPlans } from "../config/billing";
import { env } from "../env";
import { badRequest, unauthorized, parseJsonBody, validationError } from "../lib/http";
import { ensureCreditBillingEnabled, ensureSubscriptionBillingEnabled, getBillingModeDisabledErrorMessage } from "../lib/feature-guards";

export { buildDodoCheckoutUrl } from "../lib/dodo-checkout";

export function createPaymentsRouter() {
  const router = new Hono<AppEnv>();

  function productIdForActiveProvider(product: { providerProductIds: Record<string, string>; key: string }) {
    const productId = product.providerProductIds[bootstrap.paymentProviders.activeProvider.name];
    if (!productId) {
      throw new Error(`No provider product configured for ${bootstrap.paymentProviders.activeProvider.name}:${product.key}`);
    }

    return productId;
  }

  router.route("/payments", bootstrap.paymentsModule.router);

  router.post("/payments/checkout", bootstrap.authModule.requireAuth, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(createCheckoutRequestSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid checkout payload");
    }

    const packageKey = "packageKey" in parsedBody.data ? parsedBody.data.packageKey : undefined;
    const planKey = "planKey" in parsedBody.data ? parsedBody.data.planKey : undefined;
    const discountCode = "discountCode" in parsedBody.data ? parsedBody.data.discountCode : undefined;
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

    const checkoutIntent = await bootstrap.checkoutIntentsService.create({
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

    const checkoutUrl = await bootstrap.paymentProviders.activeProvider.createCheckoutUrl({
      productId,
      userId: authUser.id,
      billingMode: requestMode,
      ...(requestMode === "credits" ? { packageKey } : { planKey }),
      ...(requestMode === "subscriptions" && discountCode ? { discountCode } : {}),
      referenceId: checkoutIntent.referenceId,
      customerEmail: authUser.email ?? null,
    });

    return c.json({ success: true, data: { checkoutUrl } });
  });

  router.get("/billing/reconcile", async (c) => {
    const secret = env.BILLING_RECONCILIATION_SECRET;
    const authorization = c.req.header("authorization");

    if (!secret || authorization !== `Bearer ${secret}`) {
      return unauthorized(c, "Unauthorized");
    }

    const result = await bootstrap.billingReconciliationService.reconcileProviderBillingStateSafely();
    return c.json({ success: true, data: bootstrap.billingReconciliationService.serializeResult(result) });
  });

  return router;
}
