import { afterEach, describe, expect, it, vi } from "vitest";

import { applicationConfig } from "../../../src/config/application";
import { subscriptionPlans } from "../../../src/config/billing";
import { createPaymentEventHandler } from "../../../src/modules/billing/payment-event-handler";

const originalBillingMode = applicationConfig.billing.mode;
const starterPlan = subscriptionPlans.find((plan) => plan.key === "Bronze")!;
const starterPlanProductId = starterPlan.providerProductIds.dodo;
const bronzeCreditPackage = { key: "bronze", credits: 100, price: 1000, currency: "EUR", providerProductIds: { dodo: "pdt_1" } };

afterEach(() => {
  (applicationConfig as { billing: { mode: "credits" | "subscriptions" } }).billing.mode = originalBillingMode;
});

function createBillingDeps() {
  return {
    getUserById: vi.fn().mockResolvedValue({ id: "user-1" }),
    processCreditPurchase: vi.fn().mockResolvedValue({}),
    processCreditRefund: vi.fn().mockResolvedValue({}),
    processCreditDisputeLoss: vi.fn().mockResolvedValue({}),
  };
}

function createCheckoutIntent(overrides: Record<string, unknown> = {}) {
  return {
    id: "intent-1",
    userId: "user-1",
    billingMode: "credits",
    packageKey: "bronze",
    planKey: null,
    productId: "pdt_1",
    discountCode: null,
    referenceId: "checkout-ref-1",
    paymentId: null,
    status: "pending",
    metadata: null,
    createdAt: new Date("2026-04-30T10:00:00.000Z"),
    updatedAt: new Date("2026-04-30T10:00:00.000Z"),
    completedAt: null,
    failedAt: null,
    ...overrides,
  };
}

function createCheckoutIntentDeps(intent = createCheckoutIntent()) {
  return {
    create: vi.fn(),
    findByReferenceId: vi.fn().mockResolvedValue(intent),
    markPending: vi.fn().mockResolvedValue({}),
    markCompleted: vi.fn().mockResolvedValue({}),
    markFailed: vi.fn().mockResolvedValue({}),
  };
}

describe("payment event handler billing modes", () => {
  it("rejects credit payments when subscription mode is configured", async () => {
    (applicationConfig as { billing: { mode: "credits" | "subscriptions" } }).billing.mode = "subscriptions";
    const billing = createBillingDeps();
    const handler = createPaymentEventHandler({
      creditPackages: [bronzeCreditPackage],
      billing,
    });

    await expect(handler({
      provider: "dodo",
      eventType: "payment.succeeded",
      paymentId: "pay_1",
      productId: "pdt_1",
      metadata: { userId: "user-1" },
      currency: "EUR",
      totalAmount: 1000,
      taxAmount: 0,
      raw: {},
    })).rejects.toThrow("Billing mode disabled: credits");
  });

  it("routes subscription events to the subscription webhook handler", async () => {
    (applicationConfig as { billing: { mode: "credits" | "subscriptions" } }).billing.mode = "subscriptions";
    const billing = createBillingDeps();
    const handleSubscriptionWebhook = vi.fn().mockResolvedValue(undefined);
    const handler = createPaymentEventHandler({
      creditPackages: [],
      billing,
      subscriptions: { handleSubscriptionWebhook },
    });

    await handler({
      provider: "dodo",
      eventType: "subscription.active",
      paymentId: "sub_1",
      raw: {
        data: {
          subscription_id: "sub_1",
          product_id: "pdt_subscription_starter",
          status: "active",
          metadata: { userId: "user-1", planKey: "starter" },
        },
      },
    });

    expect(handleSubscriptionWebhook).toHaveBeenCalledWith({
      event_type: "subscription.active",
      data: {
        subscription_id: "sub_1",
        product_id: "pdt_subscription_starter",
        status: "active",
        metadata: { userId: "user-1", planKey: "starter" },
      },
    });
  });

  it("records subscription payments when subscription mode payment succeeds", async () => {
    (applicationConfig as { billing: { mode: "credits" | "subscriptions" } }).billing.mode = "subscriptions";
    const billing = createBillingDeps();
    const recordSubscriptionPayment = vi.fn().mockResolvedValue({});
    const checkoutIntents = createCheckoutIntentDeps(createCheckoutIntent({
      billingMode: "subscriptions",
      packageKey: null,
      planKey: starterPlan.key,
      productId: starterPlanProductId,
    }));
    const handler = createPaymentEventHandler({
      creditPackages: [],
      billing,
      checkoutIntents,
      subscriptions: {
        handleSubscriptionWebhook: vi.fn(),
        recordSubscriptionPayment,
      },
    });

    await handler({
      provider: "dodo",
      eventType: "payment.succeeded",
      paymentId: "pay_sub_1",
      productId: starterPlanProductId,
      metadata: {
        billingMode: "subscriptions",
        userId: "user-1",
        planKey: starterPlan.key,
        productId: starterPlanProductId,
        checkoutReferenceId: "checkout-ref-1",
        subscriptionId: "sub_1",
      },
      customerId: "cus_1",
      currency: "EUR",
      totalAmount: starterPlan.price,
      taxAmount: 210,
      raw: {},
    });

    expect(recordSubscriptionPayment).toHaveBeenCalledWith({
      userId: "user-1",
      planKey: starterPlan.key,
      paymentId: "pay_sub_1",
      paymentStatus: "completed",
      providerCustomerId: "cus_1",
      providerSubscriptionId: "sub_1",
      dodoCustomerId: "cus_1",
      dodoSubscriptionId: "sub_1",
      pricing: {
        priceExclVat: starterPlan.price - 210,
        priceInclVat: starterPlan.price,
        vatAmount: 210,
        currency: "EUR",
      },
    });
    expect(billing.processCreditPurchase).not.toHaveBeenCalled();
  });

  it("requires a matching pending checkout intent before completing credit payments", async () => {
    (applicationConfig as { billing: { mode: "credits" | "subscriptions" } }).billing.mode = "credits";
    const billing = createBillingDeps();
    const checkoutIntents = createCheckoutIntentDeps(null as never);
    const handler = createPaymentEventHandler({
      creditPackages: [bronzeCreditPackage],
      billing,
      checkoutIntents,
    });

    await expect(handler({
      provider: "dodo",
      eventType: "payment.succeeded",
      paymentId: "pay_1",
      productId: "pdt_1",
      metadata: {
        userId: "user-1",
        billingMode: "credits",
        packageKey: "bronze",
        productId: "pdt_1",
        checkoutReferenceId: "checkout-ref-1",
      },
      currency: "EUR",
      totalAmount: 1000,
      taxAmount: 0,
      raw: {},
    })).rejects.toThrow(/checkout intent/);

    expect(checkoutIntents.findByReferenceId).toHaveBeenCalledWith("checkout-ref-1");
    expect(billing.processCreditPurchase).not.toHaveBeenCalled();
    expect(checkoutIntents.markCompleted).not.toHaveBeenCalled();
  });

  it("validates checkout intent metadata and completes credit payments", async () => {
    (applicationConfig as { billing: { mode: "credits" | "subscriptions" } }).billing.mode = "credits";
    const billing = createBillingDeps();
    const checkoutIntents = createCheckoutIntentDeps(createCheckoutIntent());
    const handler = createPaymentEventHandler({
      creditPackages: [bronzeCreditPackage],
      billing,
      checkoutIntents,
    });

    await handler({
      provider: "dodo",
      eventType: "payment.succeeded",
      paymentId: "pay_1",
      productId: "pdt_1",
      metadata: {
        userId: "user-1",
        billingMode: "credits",
        packageKey: "bronze",
        productId: "pdt_1",
        checkoutReferenceId: "checkout-ref-1",
      },
      customerId: "cus_1",
      currency: "EUR",
      totalAmount: 1000,
      taxAmount: 0,
      raw: {},
    });

    expect(billing.processCreditPurchase).toHaveBeenCalledWith(
      "user-1",
      "bronze",
      "pay_1",
      "completed",
      "cus_1",
      {
        priceExclVat: 1000,
        priceInclVat: 1000,
        vatAmount: 0,
        currency: "EUR",
      },
      {
        provider: "dodo",
        customerId: "cus_1",
      },
    );
    expect(checkoutIntents.markCompleted).toHaveBeenCalledWith({ id: "intent-1", paymentId: "pay_1" });
  });

  it("does not retry duplicate completed credit payment events for the same payment", async () => {
    (applicationConfig as { billing: { mode: "credits" | "subscriptions" } }).billing.mode = "credits";
    const billing = createBillingDeps();
    const checkoutIntents = createCheckoutIntentDeps(createCheckoutIntent({ status: "completed", paymentId: "pay_1" }));
    const handler = createPaymentEventHandler({
      creditPackages: [bronzeCreditPackage],
      billing,
      checkoutIntents,
    });

    await handler({
      provider: "dodo",
      eventType: "payment.succeeded",
      paymentId: "pay_1",
      productId: "pdt_1",
      metadata: {
        userId: "user-1",
        billingMode: "credits",
        packageKey: "bronze",
        productId: "pdt_1",
        checkoutReferenceId: "checkout-ref-1",
      },
      currency: "EUR",
      totalAmount: 1000,
      taxAmount: 0,
      raw: {},
    });

    expect(billing.processCreditPurchase).not.toHaveBeenCalled();
    expect(checkoutIntents.markCompleted).not.toHaveBeenCalled();
  });

  it("validates checkout intent metadata and records subscription payments", async () => {
    (applicationConfig as { billing: { mode: "credits" | "subscriptions" } }).billing.mode = "subscriptions";
    const billing = createBillingDeps();
    const checkoutIntents = createCheckoutIntentDeps(createCheckoutIntent({
      billingMode: "subscriptions",
      packageKey: null,
      planKey: starterPlan.key,
      productId: starterPlanProductId,
      discountCode: "SAVE10",
    }));
    const recordSubscriptionPayment = vi.fn().mockResolvedValue({});
    const handler = createPaymentEventHandler({
      creditPackages: [],
      billing,
      checkoutIntents,
      subscriptions: {
        handleSubscriptionWebhook: vi.fn(),
        recordSubscriptionPayment,
      },
    });

    await handler({
      provider: "dodo",
      eventType: "payment.succeeded",
      paymentId: "pay_sub_1",
      productId: starterPlanProductId,
      metadata: {
        billingMode: "subscriptions",
        userId: "user-1",
        planKey: starterPlan.key,
        discountCode: "SAVE10",
        productId: starterPlanProductId,
        checkoutReferenceId: "checkout-ref-1",
        subscriptionId: "sub_1",
      },
      customerId: "cus_1",
      currency: "EUR",
      totalAmount: 1900,
      taxAmount: 190,
      raw: {},
    });

    expect(recordSubscriptionPayment).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      planKey: starterPlan.key,
      paymentId: "pay_sub_1",
      paymentStatus: "completed",
    }));
    expect(checkoutIntents.markCompleted).toHaveBeenCalledWith({ id: "intent-1", paymentId: "pay_sub_1" });
  });

  it("rejects undiscounted subscription payments with unexpected amounts", async () => {
    (applicationConfig as { billing: { mode: "credits" | "subscriptions" } }).billing.mode = "subscriptions";
    const billing = createBillingDeps();
    const checkoutIntents = createCheckoutIntentDeps(createCheckoutIntent({
      billingMode: "subscriptions",
      packageKey: null,
      planKey: starterPlan.key,
      productId: starterPlanProductId,
      discountCode: null,
    }));
    const recordSubscriptionPayment = vi.fn().mockResolvedValue({});
    const handler = createPaymentEventHandler({
      creditPackages: [],
      billing,
      checkoutIntents,
      subscriptions: {
        handleSubscriptionWebhook: vi.fn(),
        recordSubscriptionPayment,
      },
    });

    await expect(handler({
      provider: "dodo",
      eventType: "payment.succeeded",
      paymentId: "pay_sub_bad_amount",
      productId: starterPlanProductId,
      metadata: {
        billingMode: "subscriptions",
        userId: "user-1",
        planKey: starterPlan.key,
        productId: starterPlanProductId,
        checkoutReferenceId: "checkout-ref-1",
        subscriptionId: "sub_1",
      },
      customerId: "cus_1",
      currency: "EUR",
      totalAmount: 500,
      taxAmount: 50,
      raw: {},
    })).rejects.toThrow("expected amount");

    expect(recordSubscriptionPayment).not.toHaveBeenCalled();
    expect(checkoutIntents.markCompleted).not.toHaveBeenCalled();
  });
});
