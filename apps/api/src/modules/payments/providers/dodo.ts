import type DodoPayments from "dodopayments";

import {
  CHECKOUT_CANCEL_RETURN_PATH,
  CHECKOUT_SUCCESS_RETURN_PATH,
  DODO_CHECKOUT_BASE_URL,
  buildCheckoutReturnUrl,
  buildDodoCheckoutUrl,
} from "../../../lib/dodo-checkout";
import { isProviderTimeout, withProviderTimeout } from "../../../lib/provider-fetch";
import type { PaymentProvider, ProviderListParams } from "../provider";

type DodoPaymentProviderOptions = {
  apiKey?: string;
  environment: "test_mode" | "live_mode";
  appUrl: string;
  client?: DodoPayments | null;
};

type DodoInvoiceResponse = {
  invoice_pdf?: string;
  invoice_url?: string;
  url?: string;
};

type DodoRefundResponse = {
  refund_id: string;
  payment_id: string;
  status: string;
  created_at?: string | null;
  reason?: string | null;
  amount?: number | null;
  currency?: string | null;
};

type DodoListResponse<T> = {
  items?: T[];
  next_cursor?: string | null;
  nextCursor?: string | null;
};

type DodoPaymentListItem = {
  payment_id: string;
  total_amount?: number | null;
  currency?: string | null;
  created_at?: string | null;
  status?: string | null;
  subscription_id?: string | null;
  invoice_url?: string | null;
  refund_status?: string | null;
  dispute_status?: string | null;
  payment_method?: string | null;
  payment_method_type?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  customer?: DodoCustomer | null;
};

type DodoSubscriptionListItem = {
  subscription_id: string;
  recurring_pre_tax_amount?: number | null;
  currency?: string | null;
  status?: string | null;
  created_at?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  next_billing_date?: string | null;
  previous_billing_date?: string | null;
  cancelled_at?: string | null;
  cancel_at_next_billing_date?: boolean | null;
  discount_id?: string | null;
  discount_cycles_remaining?: number | null;
  customer?: DodoCustomer | null;
};

type DodoCustomer = {
  customer_id?: string | null;
  email?: string | null;
  name?: string | null;
};

type DodoBalanceLedgerEntry = {
  id: string;
  event_type: string;
  amount?: number | null;
  currency?: string | null;
  is_credit?: boolean | null;
  created_at?: string | null;
  reference_object_id?: string | null;
  description?: string | null;
  before_balance?: number | null;
  after_balance?: number | null;
};

type DodoDiscountListItem = {
  discount_id: string;
  code?: string | null;
  amount?: number | null;
  type?: string | null;
  times_used?: number | null;
  usage_limit?: number | null;
  subscription_cycles?: number | null;
  expires_at?: string | null;
  restricted_to?: string[] | null;
  created_at?: string | null;
  name?: string | null;
};

type DodoDiscountResponse = DodoDiscountListItem;

type DodoProductListItem = {
  product_id: string;
  created_at?: string | null;
  updated_at?: string | null;
  is_recurring?: boolean | null;
  tax_category?: string | null;
  currency?: string | null;
  description?: string | null;
  name?: string | null;
  price?: number | null;
};

type DodoDisputeListItem = {
  dispute_id: string;
  payment_id?: string | null;
  amount?: string | number | null;
  currency?: string | null;
  dispute_status?: string | null;
  dispute_stage?: string | null;
  created_at?: string | null;
};

type DodoPayoutListItem = {
  payout_id: string;
  amount?: number | null;
  currency?: string | null;
  status?: string | null;
  fee?: number | null;
  tax?: number | null;
  refunds?: number | null;
  chargebacks?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  payout_document_url?: string | null;
};

type DodoPaymentLineItemsResponse = {
  currency: string;
  items: Array<{
    items_id: string;
    amount: number;
    tax: number;
    refundable_amount: number;
    description?: string | null;
    name?: string | null;
  }>;
};

function dodoApiBaseUrl(environment: "test_mode" | "live_mode") {
  return environment === "live_mode" ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
}

function checkoutBaseUrl(environment: "test_mode" | "live_mode") {
  return environment === "live_mode" ? DODO_CHECKOUT_BASE_URL.live_mode : DODO_CHECKOUT_BASE_URL.test_mode;
}

function invoiceUrlFromResponse(invoiceData: DodoInvoiceResponse) {
  return invoiceData.invoice_pdf ?? invoiceData.invoice_url ?? invoiceData.url;
}

function toQueryString(params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

function dodoListParams(params?: ProviderListParams) {
  return toQueryString({
    page_size: params?.pageSize,
    cursor: params?.cursor,
    created_at_gte: params?.createdAtGte,
    created_at_lte: params?.createdAtLte,
    currency: params?.currency,
  });
}

function dodoCustomer(customer?: DodoCustomer | null) {
  return customer
    ? {
        id: customer.customer_id ?? null,
        email: customer.email ?? null,
        name: customer.name ?? null,
      }
    : null;
}

function money(amount?: number | null, currency?: string | null) {
  return typeof amount === "number" && currency ? { amount, currency } : null;
}

function dodoDiscount(discount: DodoDiscountListItem) {
  return {
    provider: "dodo" as const,
    discountId: discount.discount_id,
    code: discount.code ?? null,
    type: discount.type ?? null,
    amount: discount.amount ?? null,
    timesUsed: discount.times_used ?? null,
    usageLimit: discount.usage_limit ?? null,
    subscriptionCycles: discount.subscription_cycles ?? null,
    expiresAt: discount.expires_at ?? null,
    restrictedTo: discount.restricted_to ?? [],
    createdAt: discount.created_at ?? null,
    name: discount.name ?? null,
    raw: discount,
  };
}

async function dodoApiRequest<T>(
  options: DodoPaymentProviderOptions,
  path: string,
  timeoutMessage: string,
  init?: RequestInit,
): Promise<T> {
  if (!options.apiKey) {
    throw new Error("Payment provider API key not configured");
  }

  let response: Response;
  try {
    response = await fetch(
      `${dodoApiBaseUrl(options.environment)}${path}`,
      withProviderTimeout({
        method: init?.method ?? "GET",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
        body: init?.body,
      }),
    );
  } catch (error) {
    throw new Error(isProviderTimeout(error) ? timeoutMessage : "Payment provider request failed");
  }

  if (!response.ok) {
    throw new Error("Payment provider request failed");
  }

  return response.json() as Promise<T>;
}

export function createDodoPaymentProvider(options: DodoPaymentProviderOptions): PaymentProvider {
  const financeAvailable = Boolean(options.apiKey);

  return {
    name: "dodo",
    capabilities: {
      checkout: true,
      customerPortal: Boolean(options.client?.customers?.customerPortal),
      invoices: Boolean(options.apiKey),
      refunds: Boolean(options.apiKey),
      discounts: Boolean(options.apiKey),
      finance: {
        payments: financeAvailable,
        subscriptions: financeAvailable,
        refunds: financeAvailable,
        ledger: financeAvailable,
        discounts: financeAvailable,
        products: financeAvailable,
        disputes: financeAvailable,
        payouts: financeAvailable,
        paymentLineItems: financeAvailable,
      },
    },
    createCheckoutUrl(input) {
      return buildDodoCheckoutUrl({
        baseUrl: checkoutBaseUrl(options.environment),
        productId: input.productId,
        userId: input.userId,
        billingMode: input.billingMode,
        packageKey: input.packageKey,
        planKey: input.planKey,
        referenceId: input.referenceId,
        discountCode: input.discountCode,
        customerEmail: input.customerEmail,
        successUrl: input.successUrl ?? buildCheckoutReturnUrl({ appUrl: options.appUrl, path: CHECKOUT_SUCCESS_RETURN_PATH }),
        cancelUrl: input.cancelUrl ?? buildCheckoutReturnUrl({ appUrl: options.appUrl, path: CHECKOUT_CANCEL_RETURN_PATH }),
      });
    },
    async createCustomerPortal(input) {
      const portal = options.client?.customers?.customerPortal;
      if (!portal) {
        throw new Error("Customer portal is not configured");
      }

      const session = await portal.create(input.customerId, {
        return_url: input.returnUrl,
      });

      if (!session?.link) {
        throw new Error("Customer portal URL not available");
      }

      return { portalUrl: session.link };
    },
    async getInvoice(paymentId) {
      const invoiceData = await dodoApiRequest<DodoInvoiceResponse>(options, `/invoices/payments/${paymentId}`, "Invoice provider request timed out");
      const invoiceUrl = invoiceUrlFromResponse(invoiceData);
      if (!invoiceUrl) {
        throw new Error("Invoice URL not available in API response");
      }

      return { invoiceUrl, invoiceData };
    },
    async createRefund(input) {
      const refund = await dodoApiRequest<DodoRefundResponse>(
        options,
        "/refunds",
        "Refund provider request timed out",
        {
          method: "POST",
          headers: input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : undefined,
          body: JSON.stringify({
            payment_id: input.paymentId,
            reason: input.reason ?? undefined,
            metadata: input.metadata,
          }),
        },
      );

      return {
        refundId: refund.refund_id,
        paymentId: refund.payment_id,
        status: refund.status,
        amount: refund.amount ?? null,
        currency: refund.currency ?? null,
        raw: refund,
      };
    },
    async createDiscount(input) {
      const discount = await dodoApiRequest<DodoDiscountResponse>(options, "/discounts", "Discount provider request timed out", {
        method: "POST",
        body: JSON.stringify({
          amount: input.amount,
          type: input.type,
          code: input.code,
          expires_at: input.expiresAt,
          name: input.name,
          restricted_to: input.restrictedTo,
          subscription_cycles: input.subscriptionCycles,
          usage_limit: input.usageLimit,
        }),
      });

      return dodoDiscount(discount);
    },
    async updateDiscount(id, input) {
      const body: Record<string, unknown> = {};
      if (input.amount !== undefined) body.amount = input.amount;
      if (input.type !== undefined) body.type = input.type;
      if (input.code !== undefined) body.code = input.code;
      if (input.expiresAt !== undefined) body.expires_at = input.expiresAt;
      if (input.name !== undefined) body.name = input.name;
      if (input.restrictedTo !== undefined) body.restricted_to = input.restrictedTo;
      if (input.subscriptionCycles !== undefined) body.subscription_cycles = input.subscriptionCycles;
      if (input.usageLimit !== undefined) body.usage_limit = input.usageLimit;

      const discount = await dodoApiRequest<DodoDiscountResponse>(options, `/discounts/${id}`, "Discount provider request timed out", {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      return dodoDiscount(discount);
    },
    async deleteDiscount(id) {
      await dodoApiRequest<void>(options, `/discounts/${id}`, "Discount provider request timed out", { method: "DELETE" });
    },
    finance: options.apiKey
      ? {
          async listPayments(params) {
            const data = await dodoApiRequest<DodoListResponse<DodoPaymentListItem>>(
              options,
              `/payments${dodoListParams(params)}`,
              "Payment provider finance request timed out",
            );
            return {
              items: (data.items ?? []).map((payment) => ({
                provider: "dodo",
                paymentId: payment.payment_id,
                subscriptionId: payment.subscription_id ?? null,
                customer: dodoCustomer(payment.customer),
                status: payment.status,
                amount: money(payment.total_amount, payment.currency),
                createdAt: payment.created_at ?? null,
                invoiceUrl: payment.invoice_url ?? null,
                refundStatus: payment.refund_status ?? null,
                disputeStatus: payment.dispute_status ?? null,
                paymentMethod: payment.payment_method ?? null,
                paymentMethodType: payment.payment_method_type ?? null,
                errorCode: payment.error_code ?? null,
                errorMessage: payment.error_message ?? null,
                raw: payment,
              })),
              nextCursor: data.next_cursor ?? data.nextCursor ?? null,
            };
          },
          async listSubscriptions(params) {
            const data = await dodoApiRequest<DodoListResponse<DodoSubscriptionListItem>>(
              options,
              `/subscriptions${dodoListParams(params)}`,
              "Payment provider finance request timed out",
            );
            return {
              items: (data.items ?? []).map((subscription) => ({
                provider: "dodo",
                subscriptionId: subscription.subscription_id,
                customer: dodoCustomer(subscription.customer),
                status: subscription.status,
                productId: subscription.product_id ?? null,
                productName: subscription.product_name ?? null,
                amount: money(subscription.recurring_pre_tax_amount, subscription.currency),
                createdAt: subscription.created_at ?? null,
                nextBillingDate: subscription.next_billing_date ?? null,
                previousBillingDate: subscription.previous_billing_date ?? null,
                canceledAt: subscription.cancelled_at ?? null,
                cancelAtNextBillingDate: subscription.cancel_at_next_billing_date ?? null,
                discountId: subscription.discount_id ?? null,
                discountCyclesRemaining: subscription.discount_cycles_remaining ?? null,
                raw: subscription,
              })),
              nextCursor: data.next_cursor ?? data.nextCursor ?? null,
            };
          },
          async listRefunds(params) {
            const data = await dodoApiRequest<DodoListResponse<DodoRefundResponse>>(
              options,
              `/refunds${dodoListParams(params)}`,
              "Payment provider refunds request timed out",
            );
            return {
              items: (data.items ?? []).map((refund) => ({
                provider: "dodo",
                refundId: refund.refund_id,
                paymentId: refund.payment_id,
                status: refund.status,
                amount: money(refund.amount, refund.currency),
                createdAt: refund.created_at ?? null,
                reason: refund.reason ?? null,
                raw: refund,
              })),
              nextCursor: data.next_cursor ?? data.nextCursor ?? null,
            };
          },
          async listBalanceLedgerEntries(params) {
            const data = await dodoApiRequest<DodoListResponse<DodoBalanceLedgerEntry>>(
              options,
              `/balances/ledger${dodoListParams(params)}`,
              "Payment provider ledger request timed out",
            );
            return {
              items: (data.items ?? []).map((entry) => ({
                provider: "dodo",
                id: entry.id,
                eventType: entry.event_type,
                amount: money(entry.amount, entry.currency),
                isCredit: entry.is_credit ?? null,
                createdAt: entry.created_at ?? null,
                referenceObjectId: entry.reference_object_id ?? null,
                description: entry.description ?? null,
                beforeBalance: entry.before_balance ?? null,
                afterBalance: entry.after_balance ?? null,
                raw: entry,
              })),
              nextCursor: data.next_cursor ?? data.nextCursor ?? null,
            };
          },
          async listDiscounts(params) {
            const data = await dodoApiRequest<DodoListResponse<DodoDiscountListItem>>(
              options,
              `/discounts${dodoListParams(params)}`,
              "Payment provider discounts request timed out",
            );
            return {
              items: (data.items ?? []).map(dodoDiscount),
              nextCursor: data.next_cursor ?? data.nextCursor ?? null,
            };
          },
          async listProducts(params) {
            const data = await dodoApiRequest<DodoListResponse<DodoProductListItem>>(
              options,
              `/products${dodoListParams(params)}`,
              "Payment provider products request timed out",
            );
            return {
              items: (data.items ?? []).map((product) => ({
                provider: "dodo",
                productId: product.product_id,
                name: product.name ?? null,
                description: product.description ?? null,
                price: money(product.price, product.currency),
                isRecurring: product.is_recurring ?? null,
                taxCategory: product.tax_category ?? null,
                createdAt: product.created_at ?? null,
                updatedAt: product.updated_at ?? null,
                raw: product,
              })),
              nextCursor: data.next_cursor ?? data.nextCursor ?? null,
            };
          },
          async listDisputes(params) {
            const data = await dodoApiRequest<DodoListResponse<DodoDisputeListItem>>(
              options,
              `/disputes${dodoListParams(params)}`,
              "Payment provider disputes request timed out",
            );
            return {
              items: (data.items ?? []).map((dispute) => ({
                provider: "dodo",
                disputeId: dispute.dispute_id,
                paymentId: dispute.payment_id ?? null,
                amount: money(typeof dispute.amount === "string" ? Number(dispute.amount) : dispute.amount, dispute.currency),
                status: dispute.dispute_status ?? null,
                stage: dispute.dispute_stage ?? null,
                createdAt: dispute.created_at ?? null,
                raw: dispute,
              })),
              nextCursor: data.next_cursor ?? data.nextCursor ?? null,
            };
          },
          async listPayouts(params) {
            const data = await dodoApiRequest<DodoListResponse<DodoPayoutListItem>>(
              options,
              `/payouts${dodoListParams(params)}`,
              "Payment provider payouts request timed out",
            );
            return {
              items: (data.items ?? []).map((payout) => ({
                provider: "dodo",
                payoutId: payout.payout_id,
                amount: money(payout.amount, payout.currency),
                status: payout.status ?? null,
                fee: payout.fee ?? null,
                tax: payout.tax ?? null,
                refunds: payout.refunds ?? null,
                chargebacks: payout.chargebacks ?? null,
                createdAt: payout.created_at ?? null,
                updatedAt: payout.updated_at ?? null,
                documentUrl: payout.payout_document_url ?? null,
                raw: payout,
              })),
              nextCursor: data.next_cursor ?? data.nextCursor ?? null,
            };
          },
          async retrievePaymentLineItems(paymentId) {
            const data = await dodoApiRequest<DodoPaymentLineItemsResponse>(
              options,
              `/payments/${encodeURIComponent(paymentId)}/line-items`,
              "Payment provider line items request timed out",
            );
            return {
              currency: data.currency,
              items: data.items.map((item) => ({
                id: item.items_id,
                amount: item.amount,
                tax: item.tax,
                refundableAmount: item.refundable_amount,
                description: item.description ?? null,
                name: item.name ?? null,
              })),
            };
          },
        }
      : undefined,
  };
}
