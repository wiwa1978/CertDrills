import { describe, expect, it, vi } from "vitest";

import { createDodoPaymentProvider } from "../../../src/modules/payments/providers/dodo";

describe("Dodo payment provider checkout sessions", () => {
  it("creates credit checkout sessions with the credits brand and fixed product price", async () => {
    const create = vi.fn().mockResolvedValue({ checkout_url: "https://checkout.test/session/credits" });
    const provider = createDodoPaymentProvider({
      apiKey: "test-key",
      environment: "test_mode",
      appUrl: "https://app.test",
      brands: {
        credits: "brnd_credits",
        subscriptions: "brnd_subscriptions",
        transactions: "brnd_transactions",
      },
      client: { checkoutSessions: { create } } as any,
    });

    await expect(Promise.resolve(provider.createCheckoutUrl({
      productId: "pdt_credits",
      userId: "user-1",
      billingMode: "credits",
      packageKey: "advanced",
      referenceId: "checkout-ref-1",
      discountCode: "SAVE10",
      customerEmail: "alice@example.com",
      billingAddress: {
        street: "Main",
        number: "12",
        zipcode: "1000",
        town: "Brussels",
        countryCode: "BE",
        countryName: "Belgium",
      },
      successUrl: "https://app.test/credits/success",
      cancelUrl: "https://app.test/credits/cancel",
    }))).resolves.toBe("https://checkout.test/session/credits");

    expect(create).toHaveBeenCalledWith({
      brand_id: "brnd_credits",
      product_cart: [{ product_id: "pdt_credits", quantity: 1 }],
      customer: { email: "alice@example.com" },
      billing_address: {
        country: "BE",
        city: "Brussels",
        state: "Belgium",
        street: "Main 12",
        zipcode: "1000",
      },
      discount_code: "SAVE10",
      feature_flags: { allow_discount_code: true },
      metadata: {
        billingMode: "credits",
        userId: "user-1",
        productId: "pdt_credits",
        referenceId: "checkout-ref-1",
        checkoutReferenceId: "checkout-ref-1",
        packageKey: "advanced",
        discountCode: "SAVE10",
      },
      return_url: "https://app.test/credits/success",
      cancel_url: "https://app.test/credits/cancel",
      short_link: false,
    });
    expect(create.mock.calls[0]?.[0].product_cart[0]).not.toHaveProperty("amount");
  });

  it("creates subscription checkout sessions with the subscriptions brand and omits undefined metadata", async () => {
    const create = vi.fn().mockResolvedValue({ checkout_url: "https://checkout.test/session/subscriptions" });
    const provider = createDodoPaymentProvider({
      apiKey: "test-key",
      environment: "test_mode",
      appUrl: "https://app.test",
      brands: { subscriptions: "brnd_subscriptions" },
      client: { checkoutSessions: { create } } as any,
    });

    await expect(Promise.resolve(provider.createCheckoutUrl({
      productId: "pdt_subscription",
      userId: "user-2",
      billingMode: "subscriptions",
      planKey: "starter",
    }))).resolves.toBe("https://checkout.test/session/subscriptions");

    expect(create).toHaveBeenCalledWith({
      brand_id: "brnd_subscriptions",
      product_cart: [{ product_id: "pdt_subscription", quantity: 1 }],
      customer: undefined,
      billing_address: undefined,
      discount_code: undefined,
      feature_flags: { allow_discount_code: false },
      metadata: {
        billingMode: "subscriptions",
        userId: "user-2",
        productId: "pdt_subscription",
        planKey: "starter",
      },
      return_url: "https://app.test/billing?success=true",
      cancel_url: "https://app.test/billing?cancel=true",
      short_link: false,
    });
    expect(Object.values(create.mock.calls[0]?.[0].metadata)).not.toContain(undefined);
  });

  it("fails before calling Dodo when the selected mode brand is missing", async () => {
    const create = vi.fn();
    const provider = createDodoPaymentProvider({
      apiKey: "test-key",
      environment: "test_mode",
      appUrl: "https://app.test",
      brands: { subscriptions: "brnd_subscriptions" },
      client: { checkoutSessions: { create } } as any,
    });

    await expect(Promise.resolve(provider.createCheckoutUrl({
      productId: "pdt_credits",
      userId: "user-1",
      billingMode: "credits",
    }))).rejects.toThrow("Missing Dodo brand configuration for credits");
    expect(create).not.toHaveBeenCalled();
  });

  it("fails clearly when checkout sessions are unavailable", async () => {
    const provider = createDodoPaymentProvider({
      apiKey: "test-key",
      environment: "test_mode",
      appUrl: "https://app.test",
      brands: { credits: "brnd_credits" },
      client: null,
    });

    await expect(Promise.resolve(provider.createCheckoutUrl({
      productId: "pdt_credits",
      userId: "user-1",
      billingMode: "credits",
    }))).rejects.toThrow("Checkout sessions are not configured");
  });

  it("fails clearly when checkout sessions do not return a URL", async () => {
    const provider = createDodoPaymentProvider({
      apiKey: "test-key",
      environment: "test_mode",
      appUrl: "https://app.test",
      brands: { subscriptions: "brnd_subscriptions" },
      client: { checkoutSessions: { create: vi.fn().mockResolvedValue({ session_id: "cs_1" }) } } as any,
    });

    await expect(Promise.resolve(provider.createCheckoutUrl({
      productId: "pdt_subscription",
      userId: "user-1",
      billingMode: "subscriptions",
    }))).rejects.toThrow("Checkout session URL not available");
  });

  it("normalizes 4xx and non-4xx checkout errors with their causes", async () => {
    const rejected = Object.assign(new Error("422 Product missing"), { status: 422 });
    const unavailable = Object.assign(new Error("Dodo unavailable"), { status: 503 });
    const create = vi.fn().mockRejectedValueOnce(rejected).mockRejectedValueOnce(unavailable);
    const provider = createDodoPaymentProvider({
      apiKey: "test-key",
      environment: "test_mode",
      appUrl: "https://app.test",
      brands: { credits: "brnd_credits" },
      client: { checkoutSessions: { create } } as any,
    });
    const input = { productId: "pdt_credits", userId: "user-1", billingMode: "credits" as const };

    const clientError = await Promise.resolve(provider.createCheckoutUrl(input)).catch((error) => error);
    expect(clientError).toMatchObject({
      message: "Dodo checkout rejected the configured products",
      cause: rejected,
    });

    const serverError = await Promise.resolve(provider.createCheckoutUrl(input)).catch((error) => error);
    expect(serverError).toMatchObject({
      message: "Dodo checkout could not be created",
      cause: unavailable,
    });
  });
});

describe("Dodo payment provider transaction checkout", () => {
  it("creates checkout sessions with multiple product cart items", async () => {
    const create = vi.fn().mockResolvedValue({ session_id: "cs_1", checkout_url: "https://checkout.test/session/cs_1" });
    const provider = createDodoPaymentProvider({
      apiKey: "test-key",
      environment: "test_mode",
      appUrl: "https://app.test",
      brands: { transactions: "brnd_transaction" },
      client: { checkoutSessions: { create } } as any,
    });

    await expect(provider.createTransactionCheckoutUrl!({
      userId: "user-1",
      orderId: "order-1",
      referenceId: "checkout-ref-1",
      customerEmail: "alice@example.com",
      currency: "EUR",
      cancelUrl: "https://app.test/billing?cancel=true",
      items: [
        { productId: "pdt_basic", quantity: 2, amount: 500 },
        { productId: "pdt_advanced", quantity: 1, amount: 1000 },
      ],
      billingAddress: null,
    })).resolves.toBe("https://checkout.test/session/cs_1");

    expect(create).toHaveBeenCalledWith({
      brand_id: "brnd_transaction",
      product_cart: [
        { product_id: "pdt_basic", quantity: 2, amount: 500 },
        { product_id: "pdt_advanced", quantity: 1, amount: 1000 },
      ],
      customer: { email: "alice@example.com" },
      billing_currency: "EUR",
      billing_address: undefined,
      discount_code: undefined,
      feature_flags: { allow_discount_code: false },
      metadata: {
        billingMode: "transactions",
        userId: "user-1",
        orderId: "order-1",
        referenceId: "checkout-ref-1",
        checkoutReferenceId: "checkout-ref-1",
      },
      return_url: "https://app.test/billing?success=true",
      cancel_url: "https://app.test/billing?cancel=true",
      short_link: false,
    });
  });

  it("maps billing addresses into checkout sessions", async () => {
    const create = vi.fn().mockResolvedValue({ session_id: "cs_1", checkout_url: "https://checkout.test/session/cs_1" });
    const provider = createDodoPaymentProvider({
      apiKey: "test-key",
      environment: "test_mode",
      appUrl: "https://app.test",
      brands: { transactions: "brnd_transaction" },
      client: { checkoutSessions: { create } } as any,
    });

    await provider.createTransactionCheckoutUrl!({
      userId: "user-1",
      orderId: "order-1",
      referenceId: "checkout-ref-1",
      currency: "EUR",
      items: [{ productId: "pdt_basic", quantity: 1, amount: 500 }],
      billingAddress: {
        street: "Main",
        number: "12",
        zipcode: "1000",
        town: "Brussels",
        countryCode: "BE",
        countryName: "Belgium",
      },
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      billing_address: {
        country: "BE",
        city: "Brussels",
        state: "Belgium",
        street: "Main 12",
        zipcode: "1000",
      },
    }));
  });

  it("fails clearly when checkout sessions do not return a URL", async () => {
    const create = vi.fn().mockResolvedValue({ session_id: "cs_1" });
    const provider = createDodoPaymentProvider({
      apiKey: "test-key",
      environment: "test_mode",
      appUrl: "https://app.test",
      brands: { transactions: "brnd_transaction" },
      client: { checkoutSessions: { create } } as any,
    });

    await expect(provider.createTransactionCheckoutUrl!({
      userId: "user-1",
      orderId: "order-1",
      referenceId: "checkout-ref-1",
      currency: "EUR",
      items: [{ productId: "pdt_basic", quantity: 1, amount: 500 }],
      billingAddress: null,
    })).rejects.toThrow("Checkout session URL not available");
  });

  it("fails clearly when checkout sessions are unavailable", async () => {
    const provider = createDodoPaymentProvider({
      apiKey: "test-key",
      environment: "test_mode",
      appUrl: "https://app.test",
      brands: { transactions: "brnd_transaction" },
      client: null,
    });

    await expect(provider.createTransactionCheckoutUrl!({
      userId: "user-1",
      orderId: "order-1",
      referenceId: "checkout-ref-1",
      currency: "EUR",
      items: [{ productId: "pdt_basic", quantity: 1, amount: 500 }],
      billingAddress: null,
    })).rejects.toThrow("Checkout sessions are not configured");
  });

  it("normalizes provider checkout errors without exposing provider internals", async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error("422 Product missing"), {
      status: 422,
      error: { code: "INVALID_REQUEST_PARAMETERS", message: "Product pdt_missing does not exist" },
    }));
    const provider = createDodoPaymentProvider({
      apiKey: "test-key",
      environment: "test_mode",
      appUrl: "https://app.test",
      brands: { transactions: "brnd_transaction" },
      client: { checkoutSessions: { create } } as any,
    });

    await expect(provider.createTransactionCheckoutUrl!({
      userId: "user-1",
      orderId: "order-1",
      referenceId: "checkout-ref-1",
      currency: "EUR",
      items: [{ productId: "pdt_missing", quantity: 1, amount: 500 }],
      billingAddress: null,
    })).rejects.toThrow("Dodo checkout rejected the configured products");
  });
});
