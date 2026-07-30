import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NormalizedPaymentEvent } from "@platform/payments-core";

import { buildDodoCheckoutUrl } from "../../src/lib/dodo-checkout";
import { createPaymentEventHandler } from "../../src/modules/billing/payment-event-handler";
import { creditPackages } from "../../src/config/billing";
import { applicationConfig } from "../../src/config/application";
import { createDodoPaymentProvider } from "../../src/modules/payments/providers/dodo";

describe("buildDodoCheckoutUrl", () => {
  const baseUrl = "https://test.checkout.dodopayments.com";
  const productId = "pdt_TEST";

  it("binds userId, packageKey, customer email, and redirect URLs", () => {
    const url = new URL(
      buildDodoCheckoutUrl({
        baseUrl,
        productId,
        userId: "user-123",
        packageKey: "advanced",
        referenceId: "checkout-ref-123",
        customerEmail: "buyer@example.com",
        successUrl: "https://app.example.com/billing?success=true",
        cancelUrl: "https://app.example.com/billing?cancel=true",
      }),
    );

    expect(url.origin + url.pathname).toBe(`${baseUrl}/buy/${productId}`);
    expect(url.searchParams.get("metadata_userId")).toBe("user-123");
    expect(url.searchParams.get("metadata_productId")).toBe(productId);
    expect(url.searchParams.get("metadata_packageKey")).toBe("advanced");
    expect(url.searchParams.get("metadata_referenceId")).toBe("checkout-ref-123");
    expect(url.searchParams.get("metadata_checkoutReferenceId")).toBe("checkout-ref-123");
    expect(url.searchParams.get("customer_email")).toBe("buyer@example.com");
    expect(url.searchParams.get("redirect_url")).toBe(
      "https://app.example.com/billing?success=true",
    );
    expect(url.searchParams.get("cancel_url")).toBe("https://app.example.com/billing?cancel=true");
  });

  it("omits customer_email when no email is provided", () => {
    const url = new URL(
      buildDodoCheckoutUrl({
        baseUrl,
        productId,
        userId: "user-123",
        packageKey: "advanced",
      }),
    );

    expect(url.searchParams.has("customer_email")).toBe(false);
    expect(url.searchParams.has("redirect_url")).toBe(false);
    expect(url.searchParams.has("cancel_url")).toBe(false);
    expect(url.searchParams.get("metadata_userId")).toBe("user-123");
  });

  it("URL-encodes userId values to prevent metadata smuggling", () => {
    const url = new URL(
      buildDodoCheckoutUrl({
        baseUrl,
        productId,
        userId: "victim&metadata_userId=attacker",
        packageKey: "advanced",
      }),
    );

    // searchParams.getAll returns only the values bound by *us* under the key,
    // so an attacker cannot inject a second metadata_userId via the value.
    expect(url.searchParams.getAll("metadata_userId")).toEqual([
      "victim&metadata_userId=attacker",
    ]);
  });
});

describe("createDodoPaymentProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates checkout URLs through the provider seam", async () => {
    const provider = createDodoPaymentProvider({
      environment: "test_mode",
      appUrl: "https://app.example.com",
      apiKey: "api-key",
    });

    const checkoutUrl = await provider.createCheckoutUrl({
      productId: "pdt_TEST",
      userId: "user-123",
      billingMode: "subscriptions",
      planKey: "starter",
      referenceId: "checkout-ref-123",
      customerEmail: "buyer@example.com",
    });
    const url = new URL(checkoutUrl);

    expect(provider.name).toBe("dodo");
    expect(provider.capabilities.checkout).toBe(true);
    expect(provider.capabilities.invoices).toBe(true);
    expect(url.origin + url.pathname).toBe("https://test.checkout.dodopayments.com/buy/pdt_TEST");
    expect(url.searchParams.get("metadata_billingMode")).toBe("subscriptions");
    expect(url.searchParams.get("metadata_planKey")).toBe("starter");
    expect(url.searchParams.get("metadata_checkoutReferenceId")).toBe("checkout-ref-123");
    expect(url.searchParams.get("redirect_url")).toBe("https://app.example.com/billing?success=true");
    expect(url.searchParams.get("cancel_url")).toBe("https://app.example.com/billing?cancel=true");
  });

  it("fetches invoices through the provider seam with timeout signal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ invoice_pdf: "https://invoices.test/file.pdf" }),
      }),
    );
    const provider = createDodoPaymentProvider({
      environment: "test_mode",
      appUrl: "https://app.example.com",
      apiKey: "api-key",
    });

    await expect(provider.getInvoice?.("pay_123")).resolves.toEqual({
      invoiceUrl: "https://invoices.test/file.pdf",
      invoiceData: { invoice_pdf: "https://invoices.test/file.pdf" },
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect((fetch as any).mock.calls[0]?.[0]).toBe("https://test.dodopayments.com/invoices/payments/pay_123");
    expect((fetch as any).mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("createPaymentEventHandler", () => {
  const samplePackage = creditPackages[0];
  const sampleProductId = samplePackage.providerProductIds.dodo;

  beforeEach(() => {
    (applicationConfig as { billing: { mode: "credits" | "subscriptions" } }).billing.mode = "credits";
  });

  const validPaymentEvent = (overrides: Partial<NormalizedPaymentEvent> = {}): NormalizedPaymentEvent => ({
    provider: "dodo",
    eventType: "payment.succeeded",
    paymentId: "pay_valid",
    productId: sampleProductId,
    metadata: {
      userId: "real-user-id",
      billingMode: "credits",
      packageKey: samplePackage.key,
      productId: sampleProductId,
      checkoutReferenceId: "checkout-ref-valid",
    },
    currency: "EUR",
    totalAmount: samplePackage.price,
    taxAmount: 200,
    raw: {},
    ...overrides,
  });

  const validFailedPaymentEvent = (overrides: Partial<NormalizedPaymentEvent> = {}): NormalizedPaymentEvent =>
    validPaymentEvent({
      eventType: "payment.failed",
      paymentId: "pay_failed",
      ...overrides,
    });

  const validProcessingPaymentEvent = (overrides: Partial<NormalizedPaymentEvent> = {}): NormalizedPaymentEvent =>
    validPaymentEvent({
      eventType: "payment.processing",
      paymentId: "pay_processing",
      ...overrides,
    });

  function makeDeps(overrides?: {
    findUser?: (id: string) => Promise<{ id: string } | null>;
    checkoutIntentUserId?: string;
  }) {
    const processCreditPurchase = vi.fn(async () => ({ ok: true }));
    const processCreditRefund = vi.fn(async () => ({ ok: true }));
    const processCreditDisputeLoss = vi.fn(async () => ({ ok: true }));
    const getUserById = vi.fn(
      overrides?.findUser ?? (async (id: string) => ({ id })),
    );
    const checkoutIntents = {
      create: vi.fn(),
      findByReferenceId: vi.fn(async () => ({
        id: "intent-valid",
        userId: overrides?.checkoutIntentUserId ?? "real-user-id",
        billingMode: "credits" as const,
        packageKey: samplePackage.key,
        planKey: null,
        productId: sampleProductId,
        discountCode: null,
        referenceId: "checkout-ref-valid",
        paymentId: null,
        status: "pending" as const,
        metadata: null,
        createdAt: new Date("2026-04-30T10:00:00.000Z"),
        updatedAt: new Date("2026-04-30T10:00:00.000Z"),
        completedAt: null,
        failedAt: null,
      })),
      markPending: vi.fn(async () => ({})),
      markCompleted: vi.fn(async () => ({})),
      markFailed: vi.fn(async () => ({})),
    };
    return {
      processCreditPurchase,
      processCreditRefund,
      processCreditDisputeLoss,
      getUserById,
      checkoutIntents,
      handler: createPaymentEventHandler({
        creditPackages,
        checkoutIntents,
        billing: {
          getUserById,
          processCreditPurchase,
          processCreditRefund,
          processCreditDisputeLoss,
        },
      }),
    };
  }

  it("refuses payment.succeeded without metadata.userId", async () => {
    const { handler, processCreditPurchase } = makeDeps();

    await expect(
      handler({
        provider: "dodo",
        eventType: "payment.succeeded",
        paymentId: "pay_1",
        productId: sampleProductId,
        customerEmail: "victim@example.com",
        metadata: {},
        raw: {},
      }),
    ).rejects.toThrow(/metadata\.userId missing/);

    expect(processCreditPurchase).not.toHaveBeenCalled();
  });

  it("refuses payment.succeeded when metadata.userId does not resolve", async () => {
    const { handler, processCreditPurchase } = makeDeps({
      findUser: async () => null,
      checkoutIntentUserId: "ghost-user",
    });

    await expect(
      handler({
        provider: "dodo",
        eventType: "payment.succeeded",
        paymentId: "pay_2",
        productId: sampleProductId,
        metadata: { userId: "ghost-user" },
        raw: {},
      }),
    ).rejects.toThrow(/did not resolve to a known user/);

    expect(processCreditPurchase).not.toHaveBeenCalled();
  });

  it("credits the userId from metadata, ignoring customerEmail entirely", async () => {
    const { handler, getUserById, processCreditPurchase } = makeDeps();

    await handler({
      provider: "dodo",
      eventType: "payment.succeeded",
      paymentId: "pay_3",
      productId: sampleProductId,
      // attacker-controlled email pointing at a different account
      customerEmail: "attacker@example.com",
      customerId: "cus_abc",
      metadata: {
        userId: "real-user-id",
        billingMode: "credits",
        packageKey: samplePackage.key,
        productId: sampleProductId,
        checkoutReferenceId: "checkout-ref-valid",
      },
      currency: "EUR",
      totalAmount: samplePackage.price,
      taxAmount: 200,
      raw: {},
    });

    expect(getUserById).toHaveBeenCalledWith("real-user-id");
    expect(processCreditPurchase).toHaveBeenCalledWith(
      "real-user-id",
      samplePackage.key,
      "pay_3",
      "completed",
      "cus_abc",
      {
        priceExclVat: samplePackage.price - 200,
        priceInclVat: samplePackage.price,
        vatAmount: 200,
        currency: "EUR",
      },
      {
        provider: "dodo",
        customerId: "cus_abc",
      },
    );
  });

  it("refuses payment.succeeded without currency", async () => {
    const { handler, processCreditPurchase } = makeDeps();

    await expect(handler(validPaymentEvent({ paymentId: "pay_no_currency", currency: undefined }))).rejects.toThrow(
      /currency missing/,
    );

    expect(processCreditPurchase).not.toHaveBeenCalled();
  });

  it("refuses payment.succeeded with unexpected currency", async () => {
    const { handler, processCreditPurchase } = makeDeps();

    await expect(handler(validPaymentEvent({ paymentId: "pay_usd", currency: "USD" }))).rejects.toThrow(
      /expected EUR, received USD/,
    );

    expect(processCreditPurchase).not.toHaveBeenCalled();
  });

  it("refuses payment.succeeded without total amount", async () => {
    const { handler, processCreditPurchase } = makeDeps();

    await expect(handler(validPaymentEvent({ paymentId: "pay_no_total", totalAmount: undefined }))).rejects.toThrow(
      /invalid total amount/,
    );

    expect(processCreditPurchase).not.toHaveBeenCalled();
  });

  it("refuses payment.succeeded when amount does not match package price", async () => {
    const { handler, processCreditPurchase } = makeDeps();

    await expect(handler(validPaymentEvent({ paymentId: "pay_wrong_amount", totalAmount: samplePackage.price - 1 }))).rejects.toThrow(
      /expected amount/,
    );

    expect(processCreditPurchase).not.toHaveBeenCalled();
  });

  it("refuses payment.succeeded without tax amount", async () => {
    const { handler, processCreditPurchase } = makeDeps();

    await expect(handler(validPaymentEvent({ paymentId: "pay_no_tax", taxAmount: undefined }))).rejects.toThrow(
      /invalid tax amount/,
    );

    expect(processCreditPurchase).not.toHaveBeenCalled();
  });

  it("refuses payment.succeeded when tax exceeds total", async () => {
    const { handler, processCreditPurchase } = makeDeps();

    await expect(handler(validPaymentEvent({ paymentId: "pay_tax_gt_total", taxAmount: samplePackage.price + 1 }))).rejects.toThrow(
      /tax amount exceeds total amount/,
    );

    expect(processCreditPurchase).not.toHaveBeenCalled();
  });

  it("rejects unknown product ids even with valid userId", async () => {
    const { handler, processCreditPurchase } = makeDeps();

    await expect(
      handler({
        provider: "dodo",
        eventType: "payment.succeeded",
        paymentId: "pay_5",
        productId: "pdt_DOES_NOT_EXIST",
        metadata: { userId: "real-user-id" },
        raw: {},
      }),
    ).rejects.toThrow(/Unknown product id/);

    expect(processCreditPurchase).not.toHaveBeenCalled();
  });

  it("records payment.failed without granting credits", async () => {
    const { handler, getUserById, processCreditPurchase } = makeDeps();

    await handler(validFailedPaymentEvent({ paymentId: "pay_failed", customerId: "cus_failed" }));

    expect(getUserById).toHaveBeenCalledWith("real-user-id");
    expect(processCreditPurchase).toHaveBeenCalledWith(
      "real-user-id",
      samplePackage.key,
      "pay_failed",
      "failed",
      "cus_failed",
      {
        priceExclVat: samplePackage.price - 200,
        priceInclVat: samplePackage.price,
        vatAmount: 200,
        currency: "EUR",
      },
      {
        provider: "dodo",
        customerId: "cus_failed",
      },
    );
  });

  it("records payment.processing as pending without granting credits", async () => {
    const { handler, getUserById, processCreditPurchase } = makeDeps();

    await handler(validProcessingPaymentEvent({ paymentId: "pay_processing", customerId: "cus_processing" }));

    expect(getUserById).toHaveBeenCalledWith("real-user-id");
    expect(processCreditPurchase).toHaveBeenCalledWith(
      "real-user-id",
      samplePackage.key,
      "pay_processing",
      "pending",
      "cus_processing",
      {
        priceExclVat: samplePackage.price - 200,
        priceInclVat: samplePackage.price,
        vatAmount: 200,
        currency: "EUR",
      },
      {
        provider: "dodo",
        customerId: "cus_processing",
      },
    );
  });

  it("refuses payment.failed without metadata.userId", async () => {
    const { handler, processCreditPurchase } = makeDeps();

    await expect(handler(validFailedPaymentEvent({ metadata: {} }))).rejects.toThrow(/metadata\.userId missing/);

    expect(processCreditPurchase).not.toHaveBeenCalled();
  });

  it("records full refunds by payment id", async () => {
    const { handler, processCreditPurchase, processCreditRefund, getUserById } = makeDeps();

    await handler({
      provider: "dodo",
      eventType: "refund.succeeded",
      paymentId: "pay_refunded",
      refundId: "rfnd_123",
      refundIsPartial: false,
      raw: {},
    });

    expect(processCreditRefund).toHaveBeenCalledWith("pay_refunded", "rfnd_123");
    expect(processCreditPurchase).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("rejects partial refunds pending manual reconciliation", async () => {
    const { handler, processCreditRefund } = makeDeps();

    await expect(
      handler({
        provider: "dodo",
        eventType: "refund.succeeded",
        paymentId: "pay_partial_refund",
        refundId: "rfnd_partial",
        refundIsPartial: true,
        raw: {},
      }),
    ).rejects.toThrow(/partial refunds require manual reconciliation/);

    expect(processCreditRefund).not.toHaveBeenCalled();
  });

  it("routes lost disputes to credit reversal", async () => {
    const { handler, processCreditDisputeLoss, processCreditPurchase, processCreditRefund, getUserById } = makeDeps();

    await handler({
      provider: "dodo",
      eventType: "dispute.lost",
      paymentId: "pay_disputed",
      disputeId: "disp_123",
      disputeStatus: "dispute_lost",
      raw: {},
    });

    expect(processCreditDisputeLoss).toHaveBeenCalledWith("pay_disputed", "disp_123", "dispute_lost");
    expect(processCreditPurchase).not.toHaveBeenCalled();
    expect(processCreditRefund).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("records informational dispute events without credit reversal", async () => {
    const { handler, processCreditDisputeLoss, processCreditPurchase, processCreditRefund, getUserById } = makeDeps();

    await handler({
      provider: "dodo",
      eventType: "dispute.opened",
      paymentId: "pay_disputed",
      disputeId: "disp_123",
      disputeStatus: "dispute_opened",
      raw: {},
    });

    expect(processCreditDisputeLoss).not.toHaveBeenCalled();
    expect(processCreditPurchase).not.toHaveBeenCalled();
    expect(processCreditRefund).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
  });
});
