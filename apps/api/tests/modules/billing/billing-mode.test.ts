import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  transactionProducts,
  validateTransactionProductProviderIds,
  type TransactionProductConfig,
  type TransactionProductDefinition,
} from "@platform/contracts";

import { applicationConfig, type BillingMode } from "../../../src/config/application";
import { creditPackages, subscriptionPlans } from "../../../src/config/billing";
import {
  getBillingMode,
  isCreditBillingMode,
  isSubscriptionBillingMode,
  isTransactionBillingMode,
  shouldExposeTransactionBillingSurfaces,
} from "../../../src/lib/billing-mode";
import {
  ensureCreditBillingEnabled,
  ensureSubscriptionBillingEnabled,
  ensureTransactionBillingEnabled,
} from "../../../src/lib/feature-guards";

const originalBillingMode = applicationConfig.billing.mode;

function setBillingMode(mode: BillingMode) {
  (applicationConfig as { billing: { mode: BillingMode } }).billing.mode = mode;
}

afterEach(() => {
  setBillingMode(originalBillingMode);
});

describe("billing mode", () => {
  it("uses the authoritative configured billing mode", () => {
    expect(applicationConfig.billing.mode).toBe("transactions");
  });

  it("reads the configured billing mode", () => {
    expect(getBillingMode()).toBe(applicationConfig.billing.mode);
  });

  it("detects credit, subscription, and transaction modes", () => {
    setBillingMode("credits");
    expect(isCreditBillingMode()).toBe(true);
    expect(isSubscriptionBillingMode()).toBe(false);
    expect(isTransactionBillingMode()).toBe(false);
    expect(shouldExposeTransactionBillingSurfaces()).toBe(false);

    setBillingMode("subscriptions");
    expect(isCreditBillingMode()).toBe(false);
    expect(isSubscriptionBillingMode()).toBe(true);
    expect(isTransactionBillingMode()).toBe(false);
    expect(shouldExposeTransactionBillingSurfaces()).toBe(false);

    setBillingMode("transactions");
    expect(isCreditBillingMode()).toBe(false);
    expect(isSubscriptionBillingMode()).toBe(false);
    expect(isTransactionBillingMode()).toBe(true);
    expect(shouldExposeTransactionBillingSurfaces()).toBe(true);
  });

  it("rejects disabled billing modes with clear errors", () => {
    setBillingMode("transactions");
    expect(() => ensureTransactionBillingEnabled()).not.toThrow();
    expect(() => ensureCreditBillingEnabled()).toThrow("Billing mode disabled: credits");
    expect(() => ensureSubscriptionBillingEnabled()).toThrow("Billing mode disabled: subscriptions");

    setBillingMode("credits");
    expect(() => ensureTransactionBillingEnabled()).toThrow("Billing mode disabled: transactions");
  });

  it("uses valid distinct Dodo product IDs for credits and subscriptions", () => {
    const ids = [...creditPackages, ...subscriptionPlans].map((item) => item.providerProductIds.dodo);

    expect(ids.every((id) => id.startsWith("pdt_") && !id.includes("TEST"))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("exposes the transaction product catalog through billing config exports", () => {
    expect(transactionProducts).toEqual([
      {
        key: "starterContent",
        price: 500,
        currency: "EUR",
        providerProductIds: { dodo: "pdt_0NkelzQ34bErNUPhvbEMi" },
        active: true,
        fulfillmentType: "entitlement",
        name: "Starter content access",
        description: "One durable entitlement for the starter content product.",
      },
      {
        key: "premiumContent",
        price: 1000,
        currency: "EUR",
        providerProductIds: { dodo: "pdt_0NkemCz5vlamLJsyCb4I2" },
        active: true,
        fulfillmentType: "entitlement",
        name: "Premium content access",
        description: "One durable entitlement for the premium content product.",
      },
    ]);

    const transactionProductDefinitions = Object.fromEntries(
      transactionProducts.map(({ key, ...definition }) => [key, definition]),
    ) as TransactionProductConfig;

    expectTypeOf(transactionProductDefinitions.starterContent).toEqualTypeOf<TransactionProductDefinition>();
    expect(transactionProductDefinitions.starterContent).toMatchObject({
      price: 500,
      currency: "EUR",
      providerProductIds: { dodo: "pdt_0NkelzQ34bErNUPhvbEMi" },
    });
  });

  it("requires distinct non-empty provider ids across active transaction products", () => {
    expect(() => validateTransactionProductProviderIds(transactionProducts, "dodo")).not.toThrow();
    expect(() => validateTransactionProductProviderIds([
      { ...transactionProducts[0]!, key: "first", active: true, providerProductIds: { dodo: "pdt_duplicate" } },
      { ...transactionProducts[0]!, key: "second", active: true, providerProductIds: { dodo: "pdt_duplicate" } },
    ], "dodo")).toThrow("Duplicate active transaction product id for dodo: pdt_duplicate");
  });
});
