import { describe, expect, it } from "vitest";

import { applicationConfig } from "../../../src/config/application";
import { creditPackages, subscriptionPlans } from "../../../src/config/billing";
import { getBillingMode, isCreditBillingMode, isSubscriptionBillingMode } from "../../../src/lib/billing-mode";
import { getDodoCheckoutProductsForBillingMode } from "../../../src/lib/dodo-billing-products";
import { ensureCreditBillingEnabled, ensureSubscriptionBillingEnabled } from "../../../src/lib/feature-guards";

describe("billing mode", () => {
  it("reads the configured billing mode", () => {
    expect(getBillingMode()).toBe(applicationConfig.billing.mode);
  });

  it("detects the active billing mode", () => {
    expect(isCreditBillingMode()).toBe(applicationConfig.billing.mode === "credits");
    expect(isSubscriptionBillingMode()).toBe(applicationConfig.billing.mode === "subscriptions");
  });

  it("rejects the disabled billing mode with a clear error", () => {
    if (applicationConfig.billing.mode === "credits") {
      expect(() => ensureSubscriptionBillingEnabled()).toThrow("Billing mode disabled: subscriptions");
      expect(() => ensureCreditBillingEnabled()).not.toThrow();
    } else {
      expect(() => ensureCreditBillingEnabled()).toThrow("Billing mode disabled: credits");
      expect(() => ensureSubscriptionBillingEnabled()).not.toThrow();
    }
  });

  it("maps checkout products by billing mode", () => {
    expect(getDodoCheckoutProductsForBillingMode("credits")).toEqual(
      creditPackages.map((pkg) => ({ productId: pkg.providerProductIds.dodo, slug: pkg.key })),
    );
    expect(getDodoCheckoutProductsForBillingMode("subscriptions")).toEqual(
      subscriptionPlans.map((plan) => ({ productId: plan.providerProductIds.dodo, slug: plan.key })),
    );
  });
});
