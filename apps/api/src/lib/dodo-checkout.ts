/**
 * Build a Dodo checkout URL with userId firmly bound into the payment
 * metadata so the webhook handler can credit the correct account.
 *
 * SECURITY: without this binding, an attacker could trigger payment.succeeded
 * events for arbitrary email addresses and receive credits intended for other
 * users. metadata.userId is the authoritative tie-back to the authenticated
 * session that initiated the checkout — see
 * apps/api/src/modules/billing/payment-event-handler.ts which refuses any
 * webhook missing this field.
 */
export function buildDodoCheckoutUrl(args: {
  baseUrl: string;
  productId: string;
  userId: string;
  packageKey?: string;
  planKey?: string;
  billingMode?: "credits" | "subscriptions";
  referenceId?: string;
  discountCode?: string;
  customerEmail?: string | null;
  billingAddress?: {
    street: string;
    number: string;
    zipcode: string;
    town: string;
    countryCode: string;
    countryName?: string | null;
  } | null;
  successUrl?: string;
  cancelUrl?: string;
}) {
  const url = new URL(`${args.baseUrl}/buy/${args.productId}`);
  url.searchParams.set("metadata_userId", args.userId);
  url.searchParams.set("metadata_productId", args.productId);
  if (args.billingMode) {
    url.searchParams.set("metadata_billingMode", args.billingMode);
  }
  if (args.packageKey) {
    url.searchParams.set("metadata_packageKey", args.packageKey);
  }
  if (args.planKey) {
    url.searchParams.set("metadata_planKey", args.planKey);
  }
  if (args.referenceId) {
    url.searchParams.set("metadata_referenceId", args.referenceId);
    url.searchParams.set("metadata_checkoutReferenceId", args.referenceId);
  }
  if (args.discountCode) {
    url.searchParams.set("metadata_discountCode", args.discountCode);
    url.searchParams.set("discount_code", args.discountCode);
    url.searchParams.set("allow_discount_code", "true");
  }
  if (args.customerEmail) {
    url.searchParams.set("customer_email", args.customerEmail);
  }
  if (args.billingAddress) {
    url.searchParams.set("billing_address_country", args.billingAddress.countryCode);
    url.searchParams.set("billing_address_city", args.billingAddress.town);
    url.searchParams.set("billing_address_street", `${args.billingAddress.street} ${args.billingAddress.number}`.trim());
    url.searchParams.set("billing_address_zipcode", args.billingAddress.zipcode);
    if (args.billingAddress.countryName) {
      url.searchParams.set("billing_address_state", args.billingAddress.countryName);
    }
  }
  if (args.successUrl) {
    url.searchParams.set("redirect_url", args.successUrl);
  }
  if (args.cancelUrl) {
    url.searchParams.set("cancel_url", args.cancelUrl);
  }
  return url.toString();
}

export const CHECKOUT_SUCCESS_RETURN_PATH = "/billing?success=true";
export const CHECKOUT_CANCEL_RETURN_PATH = "/billing?cancel=true";

export function buildCheckoutReturnUrl(args: { appUrl: string; path: string }) {
  return new URL(args.path, args.appUrl).toString();
}

export const DODO_CHECKOUT_BASE_URL = {
  live_mode: "https://checkout.dodopayments.com",
  test_mode: "https://test.checkout.dodopayments.com",
} as const;
