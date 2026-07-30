export type PaymentProviderName = "dodo" | (string & {});

export type BillingMode = "credits" | "subscriptions";
export type ProviderPaymentStatus = "completed" | "pending" | "failed" | "refunded" | string;
export type ProviderSubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "expired" | "paused" | string;

export type ProviderListParams = {
  pageSize?: number;
  cursor?: string;
  createdAtGte?: string;
  createdAtLte?: string;
  currency?: string;
};

export type ProviderMoney = {
  amount: number;
  currency: string;
};

export type ProviderCustomer = {
  id: string | null;
  email: string | null;
  name: string | null;
};

export type CreateCheckoutInput = {
  productId: string;
  userId: string;
  billingMode: BillingMode;
  packageKey?: string;
  planKey?: string;
  referenceId?: string;
  discountCode?: string;
  customerEmail?: string | null;
  successUrl?: string;
  cancelUrl?: string;
};

export type InvoiceResult = {
  invoiceUrl: string;
  invoiceData?: unknown;
};

export type CustomerPortalInput = {
  customerId: string;
  returnUrl: string;
};

export type CustomerPortalResult = {
  portalUrl: string;
};

export type CreateRefundInput = {
  paymentId: string;
  reason?: string | null;
  metadata?: Record<string, string>;
  idempotencyKey?: string | null;
};

export type RefundResult = {
  refundId: string;
  paymentId: string;
  status: string;
  amount?: number | null;
  currency?: string | null;
  raw?: unknown;
};

export type ProviderPaymentListItem = {
  provider: PaymentProviderName;
  paymentId: string;
  subscriptionId: string | null;
  customer: ProviderCustomer | null;
  status?: ProviderPaymentStatus | null;
  amount: ProviderMoney | null;
  createdAt: string | null;
  invoiceUrl: string | null;
  refundStatus: string | null;
  disputeStatus: string | null;
  paymentMethod: string | null;
  paymentMethodType: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  raw?: unknown;
};

export type ProviderSubscriptionListItem = {
  provider: PaymentProviderName;
  subscriptionId: string;
  customer: ProviderCustomer | null;
  status?: ProviderSubscriptionStatus | null;
  productId: string | null;
  productName: string | null;
  amount: ProviderMoney | null;
  createdAt: string | null;
  nextBillingDate: string | null;
  previousBillingDate: string | null;
  canceledAt: string | null;
  cancelAtNextBillingDate: boolean | null;
  discountId: string | null;
  discountCyclesRemaining: number | null;
  raw?: unknown;
};

export type ProviderRefundListItem = {
  provider: PaymentProviderName;
  refundId: string;
  paymentId: string;
  status: string;
  amount: ProviderMoney | null;
  createdAt: string | null;
  reason: string | null;
  raw?: unknown;
};

export type ProviderLedgerEntry = {
  provider: PaymentProviderName;
  id: string;
  eventType: string;
  amount: ProviderMoney | null;
  isCredit: boolean | null;
  createdAt: string | null;
  referenceObjectId: string | null;
  description: string | null;
  beforeBalance: number | null;
  afterBalance: number | null;
  raw?: unknown;
};

export type ProviderDiscount = {
  provider: PaymentProviderName;
  discountId: string;
  code: string | null;
  type: string | null;
  amount: number | null;
  timesUsed: number | null;
  usageLimit: number | null;
  subscriptionCycles: number | null;
  expiresAt: string | null;
  restrictedTo: string[];
  createdAt: string | null;
  name: string | null;
  raw?: unknown;
};

export type ProviderCreateDiscountInput = {
  amount: number;
  type: "percentage";
  code: string | null;
  expiresAt: string | null;
  name: string | null;
  restrictedTo: string[] | null;
  subscriptionCycles: number | null;
  usageLimit: number | null;
};

export type ProviderUpdateDiscountInput = Partial<ProviderCreateDiscountInput>;

export type ProviderProduct = {
  provider: PaymentProviderName;
  productId: string;
  name: string | null;
  description: string | null;
  price: ProviderMoney | null;
  isRecurring: boolean | null;
  taxCategory: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  raw?: unknown;
};

export type ProviderDispute = {
  provider: PaymentProviderName;
  disputeId: string;
  paymentId: string | null;
  amount: ProviderMoney | null;
  status: string | null;
  stage: string | null;
  createdAt: string | null;
  raw?: unknown;
};

export type ProviderPayout = {
  provider: PaymentProviderName;
  payoutId: string;
  amount: ProviderMoney | null;
  status: string | null;
  fee: number | null;
  tax: number | null;
  refunds: number | null;
  chargebacks: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  documentUrl: string | null;
  raw?: unknown;
};

export type ProviderPaymentLineItems = {
  currency: string;
  items: Array<{
    id: string;
    amount: number;
    tax: number;
    refundableAmount: number;
    description: string | null;
    name: string | null;
  }>;
};

export type ProviderListResult<T> = {
  items: T[];
  nextCursor?: string | null;
};

export type PaymentProviderFinance = {
  listPayments?: (params?: ProviderListParams) => Promise<ProviderListResult<ProviderPaymentListItem>>;
  listSubscriptions?: (params?: ProviderListParams) => Promise<ProviderListResult<ProviderSubscriptionListItem>>;
  listRefunds?: (params?: ProviderListParams) => Promise<ProviderListResult<ProviderRefundListItem>>;
  listBalanceLedgerEntries?: (params?: ProviderListParams) => Promise<ProviderListResult<ProviderLedgerEntry>>;
  listDiscounts?: (params?: ProviderListParams) => Promise<ProviderListResult<ProviderDiscount>>;
  listProducts?: (params?: ProviderListParams) => Promise<ProviderListResult<ProviderProduct>>;
  listDisputes?: (params?: ProviderListParams) => Promise<ProviderListResult<ProviderDispute>>;
  listPayouts?: (params?: ProviderListParams) => Promise<ProviderListResult<ProviderPayout>>;
  retrievePaymentLineItems?: (paymentId: string) => Promise<ProviderPaymentLineItems>;
};

export type PaymentProviderFinanceCapabilities = {
  payments: boolean;
  subscriptions: boolean;
  refunds: boolean;
  ledger: boolean;
  discounts: boolean;
  products: boolean;
  disputes: boolean;
  payouts: boolean;
  paymentLineItems: boolean;
};

export type PaymentProviderCapabilities = {
  checkout: boolean;
  customerPortal: boolean;
  invoices: boolean;
  refunds: boolean;
  discounts: boolean;
  finance: PaymentProviderFinanceCapabilities;
};

export type PaymentProvider = {
  name: PaymentProviderName;
  capabilities: PaymentProviderCapabilities;
  createCheckoutUrl(input: CreateCheckoutInput): Promise<string> | string;
  createCustomerPortal?(input: CustomerPortalInput): Promise<CustomerPortalResult>;
  getInvoice?(paymentId: string): Promise<InvoiceResult>;
  createRefund?(input: CreateRefundInput): Promise<RefundResult>;
  createDiscount?(input: ProviderCreateDiscountInput): Promise<ProviderDiscount>;
  updateDiscount?(id: string, input: ProviderUpdateDiscountInput): Promise<ProviderDiscount>;
  deleteDiscount?(id: string): Promise<void>;
  finance?: PaymentProviderFinance;
};

export type PaymentProviderRegistry = {
  activeProvider: PaymentProvider;
  getProvider(name?: PaymentProviderName): PaymentProvider;
};

export function createPaymentProviderRegistry(
  activeProvider: PaymentProvider,
  additionalProviders: PaymentProvider[] = [],
): PaymentProviderRegistry {
  const providers = new Map<PaymentProviderName, PaymentProvider>([
    [activeProvider.name, activeProvider],
    ...additionalProviders.map((provider) => [provider.name, provider] as const),
  ]);

  return {
    activeProvider,
    getProvider(name = activeProvider.name) {
      const provider = providers.get(name);
      if (!provider) {
        throw new Error(`Payment provider is not configured: ${name}`);
      }

      return provider;
    },
  };
}
