import type { PaymentProvider } from "../provider";

export function createStripePaymentProvider(): PaymentProvider {
  const notConfigured = () => {
    throw new Error("Stripe payment provider is not configured");
  };

  return {
    name: "stripe",
    capabilities: {
      checkout: false,
      customerPortal: false,
      invoices: false,
      refunds: false,
      discounts: false,
      finance: {
        payments: false,
        subscriptions: false,
        refunds: false,
        ledger: false,
        discounts: false,
        products: false,
        disputes: false,
        payouts: false,
        paymentLineItems: false,
      },
    },
    createCheckoutUrl() {
      return notConfigured();
    },
  };
}
