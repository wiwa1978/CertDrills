import { z } from "zod";

import { successResultSchema } from "../common/result";

export const creditBalanceSchema = z.object({
  balance: z.number().nonnegative(),
  totalPurchased: z.number().nonnegative(),
  totalSpent: z.number().nonnegative(),
  totalPurchasedAmount: z.number().nonnegative(),
  totalPurchasedAmountExclVat: z.number().nonnegative(),
  totalVatPaid: z.number().nonnegative(),
  totalPurchases: z.number().int().nonnegative(),
});

export const creditTransactionSchema = z.object({
  id: z.string(),
  type: z.enum(["purchase", "usage", "refund", "bonus", "admin_adjustment", "voucher"]),
  amount: z.string(),
  balanceAfter: z.string(),
  description: z.string(),
  referenceType: z.string().nullable().optional(),
  referenceId: z.string().nullable().optional(),
  metadata: z.unknown().optional(),
  createdAt: z.string(),
});

export const creditPurchaseSchema = z.object({
  id: z.string(),
  packageKey: z.string(),
  credits: z.number().int().nonnegative(),
  bonusCredits: z.number().int().nonnegative(),
  priceExclVat: z.number().nonnegative(),
  priceInclVat: z.number().nonnegative(),
  vatAmount: z.number().nonnegative().optional(),
  currency: z.string().min(1).optional(),
  paymentStatus: z.enum(["pending", "completed", "failed", "refunded"]),
  paymentId: z.string().optional(),
  createdAt: z.string(),
  userId: z.string().optional(),
  userName: z.string().nullable().optional(),
  userEmail: z.string().optional(),
});

export const billingStatsSchema = z.object({
  totalPurchases: z.number().int().nonnegative(),
  totalCreditsPurchased: z.number().nonnegative(),
  purchasedCredits: z.number().nonnegative(),
  bonusCredits: z.number().nonnegative(),
  purchaseBonusCredits: z.number().nonnegative().optional(),
  voucherCredits: z.number().optional(),
  refundCredits: z.number().optional(),
  adminAdjustmentCredits: z.number().optional(),
  totalCreditsConsumed: z.number().nonnegative(),
  totalRevenue: z.number().nonnegative(),
});

export const revenuePointSchema = z.object({
  period: z.string(),
  revenue: z.number().nonnegative(),
  count: z.number().int().nonnegative(),
});

export const transactionPointSchema = z.object({
  period: z.string(),
  count: z.number().int().nonnegative(),
});

export const creditsConsumedPointSchema = z.object({
  period: z.string(),
  consumed: z.number().nonnegative(),
});

export const adminTransactionListItemSchema = creditTransactionSchema.extend({
  userId: z.string(),
  userName: z.string().nullable().optional(),
  userEmail: z.string(),
});

export const subscriptionStatusSchema = z.enum([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "expired",
  "paused",
]);

export const userSubscriptionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  planKey: z.string(),
  providerCustomerId: z.string().nullable().optional(),
  providerSubscriptionId: z.string(),
  dodoCustomerId: z.string().nullable().optional(),
  dodoSubscriptionId: z.string(),
  status: subscriptionStatusSchema,
  currentPeriodStart: z.string().nullable().optional(),
  currentPeriodEnd: z.string().nullable().optional(),
  cancelAtPeriodEnd: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  userName: z.string().nullable().optional(),
  userEmail: z.string().optional(),
});

export const subscriptionPaymentSchema = z.object({
  id: z.string(),
  planKey: z.string(),
  providerSubscriptionId: z.string().nullable().optional(),
  dodoSubscriptionId: z.string().nullable().optional(),
  paymentStatus: z.string(),
  paymentId: z.string(),
  priceExclVat: z.number().int().nonnegative(),
  priceInclVat: z.number().int().nonnegative(),
  vatAmount: z.number().int().nonnegative(),
  currency: z.string(),
  paymentMethod: z.string().nullable().optional(),
  paymentMethodType: z.string().nullable().optional(),
  refundStatus: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string(),
});

export const adminSubscriptionPaymentListItemSchema = subscriptionPaymentSchema.extend({
  userId: z.string(),
  userName: z.string().nullable().optional(),
  userEmail: z.string().optional(),
});

export const adminBillingWarningSchema = z.object({
  source: z.string(),
  message: z.string(),
});

export const adminBillingPaginationSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().positive(),
  search: z.string(),
});

export const adminCreditsDashboardSchema = z.object({
  stats: billingStatsSchema.extend({
    purchaseBonusCredits: z.number(),
    voucherCredits: z.number(),
    refundCredits: z.number(),
    adminAdjustmentCredits: z.number(),
  }),
  revenue: z.object({
    dailyData: z.array(revenuePointSchema),
    weeklyData: z.array(revenuePointSchema),
    monthlyData: z.array(revenuePointSchema),
    yearlyData: z.array(revenuePointSchema),
  }),
  consumption: z.object({
    dailyData: z.array(creditsConsumedPointSchema),
    weeklyData: z.array(creditsConsumedPointSchema),
    monthlyData: z.array(creditsConsumedPointSchema),
    yearlyData: z.array(creditsConsumedPointSchema),
  }),
  activity: z.object({
    dailyData: z.array(transactionPointSchema),
    weeklyData: z.array(transactionPointSchema),
    monthlyData: z.array(transactionPointSchema),
    yearlyData: z.array(transactionPointSchema),
  }),
  transactions: z.array(adminTransactionListItemSchema),
  purchases: z.array(creditPurchaseSchema),
  refundablePurchases: z.array(creditPurchaseSchema),
  refundedPurchases: z.array(creditPurchaseSchema),
  pagination: z.object({
    purchases: adminBillingPaginationSchema,
    refunds: adminBillingPaginationSchema,
  }),
  warnings: z.array(adminBillingWarningSchema),
});

export const adminRefundSchema = z.object({
  refundId: z.string(),
  paymentId: z.string(),
  status: z.string(),
  amount: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
});

export const adminCreditRefundResponseDataSchema = z.object({
  refund: adminRefundSchema,
  purchase: creditPurchaseSchema,
});

export const adminSubscriptionRefundResponseDataSchema = z.object({
  refund: adminRefundSchema,
  payment: adminSubscriptionPaymentListItemSchema.partial({ userName: true, userEmail: true }),
});

export const subscriptionStatsSchema = z.object({
  totalSubscriptions: z.number().int().nonnegative(),
  activeSubscriptions: z.number().int().nonnegative(),
  trialingSubscriptions: z.number().int().nonnegative(),
  pastDueSubscriptions: z.number().int().nonnegative(),
  canceledSubscriptions: z.number().int().nonnegative(),
  monthlyRecurringRevenue: z.number().nonnegative(),
  annualRecurringRevenue: z.number().nonnegative(),
});

export const subscriptionFinanceSummarySchema = z.object({
  currency: z.string(),
  grossRevenue: z.number().nonnegative(),
  refundedRevenue: z.number().nonnegative(),
  netRevenue: z.number(),
  totalPayments: z.number().int().nonnegative(),
  completedPayments: z.number().int().nonnegative(),
  refundedPayments: z.number().int().nonnegative(),
  failedPayments: z.number().int().nonnegative(),
  pendingPayments: z.number().int().nonnegative(),
  providerFinanceAvailable: z.boolean(),
  providerPaymentsChecked: z.number().int().nonnegative(),
  providerSubscriptionsChecked: z.number().int().nonnegative(),
  unmatchedProviderPayments: z.number().int().nonnegative(),
  unmatchedProviderSubscriptions: z.number().int().nonnegative(),
});

export const subscriptionPlanDistributionPointSchema = z.object({
  planKey: z.string(),
  count: z.number().int().nonnegative(),
});

export const subscriptionEventSchema = z.object({
  id: z.string(),
  userId: z.string().nullable().optional(),
  providerSubscriptionId: z.string().nullable().optional(),
  dodoSubscriptionId: z.string().nullable().optional(),
  eventType: z.string(),
  status: subscriptionStatusSchema.nullable().optional(),
  createdAt: z.string(),
});

const adminFinanceSeriesPointSchema = z.object({
  period: z.string(),
  amount: z.number(),
  amountCents: z.number().int(),
  count: z.number().int().nonnegative(),
});

const providerMoneySchema = z.object({ amount: z.number(), currency: z.string() }).nullable();
const providerCustomerSchema = z.object({ id: z.string().nullable(), email: z.string().nullable(), name: z.string().nullable() }).nullable();
const providerPaymentSchema = z.object({
  provider: z.string(),
  paymentId: z.string(),
  subscriptionId: z.string().nullable(),
  customer: providerCustomerSchema,
  status: z.string().nullable().optional(),
  amount: providerMoneySchema,
  createdAt: z.string().nullable(),
  invoiceUrl: z.string().nullable(),
  refundStatus: z.string().nullable(),
  disputeStatus: z.string().nullable(),
  paymentMethod: z.string().nullable(),
  paymentMethodType: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  raw: z.unknown().optional(),
});
const providerSubscriptionSchema = z.object({
  provider: z.string(),
  subscriptionId: z.string(),
  customer: providerCustomerSchema,
  status: z.string().nullable().optional(),
  productId: z.string().nullable(),
  productName: z.string().nullable(),
  amount: providerMoneySchema,
  createdAt: z.string().nullable(),
  nextBillingDate: z.string().nullable(),
  previousBillingDate: z.string().nullable(),
  canceledAt: z.string().nullable(),
  cancelAtNextBillingDate: z.boolean().nullable(),
  discountId: z.string().nullable(),
  discountCyclesRemaining: z.number().nullable(),
  raw: z.unknown().optional(),
});
const providerRefundSchema = z.object({ provider: z.string(), refundId: z.string(), paymentId: z.string(), status: z.string(), amount: providerMoneySchema, createdAt: z.string().nullable(), reason: z.string().nullable(), raw: z.unknown().optional() });
const providerLedgerEntrySchema = z.object({ provider: z.string(), id: z.string(), eventType: z.string(), amount: providerMoneySchema, isCredit: z.boolean().nullable(), createdAt: z.string().nullable(), referenceObjectId: z.string().nullable(), description: z.string().nullable(), beforeBalance: z.number().nullable(), afterBalance: z.number().nullable(), raw: z.unknown().optional() });
const providerDiscountSchema = z.object({ provider: z.string(), discountId: z.string(), code: z.string().nullable(), type: z.string().nullable(), amount: z.number().nullable(), timesUsed: z.number().nullable(), usageLimit: z.number().nullable(), subscriptionCycles: z.number().nullable(), expiresAt: z.string().nullable(), restrictedTo: z.array(z.string()), createdAt: z.string().nullable(), name: z.string().nullable(), raw: z.unknown().optional() });
const providerProductSchema = z.object({ provider: z.string(), productId: z.string(), name: z.string().nullable(), description: z.string().nullable(), price: providerMoneySchema, isRecurring: z.boolean().nullable(), taxCategory: z.string().nullable(), createdAt: z.string().nullable(), updatedAt: z.string().nullable(), raw: z.unknown().optional() });
const providerDisputeSchema = z.object({ provider: z.string(), disputeId: z.string(), paymentId: z.string().nullable(), amount: providerMoneySchema, status: z.string().nullable(), stage: z.string().nullable(), createdAt: z.string().nullable(), raw: z.unknown().optional() });
const providerPayoutSchema = z.object({ provider: z.string(), payoutId: z.string(), amount: providerMoneySchema, status: z.string().nullable(), fee: z.number().nullable(), tax: z.number().nullable(), refunds: z.number().nullable(), chargebacks: z.number().nullable(), createdAt: z.string().nullable(), updatedAt: z.string().nullable(), documentUrl: z.string().nullable(), raw: z.unknown().optional() });

export const adminSubscriptionFinanceDashboardSchema = z.object({
  filters: z.object({
    range: z.enum(["7d", "30d", "90d", "12m", "ytd"]),
    startDate: z.string(),
    endDate: z.string(),
    grouping: z.enum(["day", "week", "month", "year"]),
    currency: z.string().optional(),
    planKey: z.string().optional(),
    status: subscriptionStatusSchema.optional(),
    search: z.string().optional(),
    subscriptionsPage: z.number().int().positive(),
    subscriptionsSearch: z.string().optional(),
  }),
  overview: z.object({
    activeSubscriptions: z.number().int().nonnegative(),
    trialingSubscriptions: z.number().int().nonnegative(),
    pastDueSubscriptions: z.number().int().nonnegative(),
    canceledSubscriptions: z.number().int().nonnegative(),
    monthlyRecurringRevenue: z.number(),
    annualRecurringRevenue: z.number(),
    grossIncome: z.number(),
    netIncome: z.number(),
    refunds: z.number(),
    discountsUsed: z.number().int().nonnegative(),
    churnRate: z.number(),
  }),
  revenue: z.object({
    grossSeries: z.array(adminFinanceSeriesPointSchema),
    netSeries: z.array(adminFinanceSeriesPointSchema),
    cumulativeGrossSeries: z.array(adminFinanceSeriesPointSchema),
    cumulativeNetSeries: z.array(adminFinanceSeriesPointSchema),
    newMrrSeries: z.array(adminFinanceSeriesPointSchema),
  }),
  subscriptions: z.object({
    rows: z.array(userSubscriptionSchema.extend({
      latestPaymentId: z.string().nullable(),
      amount: z.number(),
      currency: z.string(),
      paymentMethod: z.string().nullable(),
      paymentMethodType: z.string().nullable(),
      providerEventAt: z.string().nullable(),
    })),
    pagination: adminBillingPaginationSchema,
    providerRows: z.array(providerSubscriptionSchema),
    planDistribution: z.array(subscriptionPlanDistributionPointSchema),
    churn: z.object({ activeAtStart: z.number().int().nonnegative(), canceledInPeriod: z.number().int().nonnegative(), cancelAtPeriodEnd: z.number().int().nonnegative(), churnRate: z.number() }),
  }),
  transactions: z.object({
    localPayments: z.array(adminSubscriptionPaymentListItemSchema),
    providerPayments: z.array(providerPaymentSchema),
    providerOnlyPayments: z.array(providerPaymentSchema),
    paymentAttemptSeries: z.array(adminFinanceSeriesPointSchema.extend({ successful: z.number().int().nonnegative() })),
    paymentAmountSeries: z.array(adminFinanceSeriesPointSchema),
    events: z.array(subscriptionEventSchema),
    ledgerRows: z.array(providerLedgerEntrySchema),
  }),
  successRate: z.object({ totalAttempts: z.number().int().nonnegative(), successfulPayments: z.number().int().nonnegative(), failedPayments: z.number().int().nonnegative(), rate: z.number(), series: z.array(z.object({ period: z.string(), total: z.number().int().nonnegative(), successful: z.number().int().nonnegative(), rate: z.number() })) }),
  accounting: z.object({ ledgerRows: z.array(providerLedgerEntrySchema), reconciliation: z.object({ grossPayments: z.number(), refunds: z.number(), disputes: z.number(), fees: z.number(), tax: z.number(), payouts: z.number(), netIncome: z.number() }) }),
  refunds: z.object({ rows: z.array(providerRefundSchema), localRefundedPayments: z.array(adminSubscriptionPaymentListItemSchema), totalAmount: z.number() }),
  discounts: z.object({ rows: z.array(z.object({ id: z.string(), code: z.string(), type: z.string(), value: z.number(), status: z.string(), currentUses: z.number().int().nonnegative(), maxUses: z.number().int().nullable(), subscriptionCycles: z.number().int().nullable(), providerDiscountId: z.string().nullable(), dodoDiscountId: z.string().nullable(), providerDiscount: providerDiscountSchema.nullable() })), providerRows: z.array(providerDiscountSchema) }),
  products: z.object({ rows: z.array(providerProductSchema), recurringCount: z.number().int().nonnegative() }),
  disputes: z.object({ rows: z.array(providerDisputeSchema), openCount: z.number().int().nonnegative(), totalAmount: z.number() }),
  payouts: z.object({ rows: z.array(providerPayoutSchema), totalAmount: z.number() }),
  freshness: z.object({ localGeneratedAt: z.string(), providerLiveDataAvailable: z.boolean() }),
  warnings: z.array(adminBillingWarningSchema),
});

export const transactionsListSchema = z.object({
  transactions: z.array(adminTransactionListItemSchema),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export const purchasesListSchema = z.object({
  purchases: z.array(creditPurchaseSchema),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export const subscriptionsListSchema = z.object({
  subscriptions: z.array(userSubscriptionSchema),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export const subscriptionPaymentsListSchema = z.object({
  payments: z.array(adminSubscriptionPaymentListItemSchema),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export const applicationConfigSchema = z.object({
  billing: z.object({
    enabled: z.boolean(),
    mode: z.enum(["credits", "subscriptions"]),
    creditSurfacesEnabled: z.boolean(),
    subscriptionSurfacesEnabled: z.boolean(),
  }),
  features: z.object({
    vouchers: z.boolean(),
    discounts: z.boolean(),
    notifications: z.boolean(),
  }),
});

export const apiKeySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  scopes: z.array(z.enum(["read:profile", "read:billing", "read:credits"])),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const createApiKeyResponseDataSchema = z.object({
  apiKey: apiKeySummarySchema,
  plaintextKey: z.string(),
});

export const creditBalanceResponseSchema = successResultSchema(creditBalanceSchema);
export const creditHistoryResponseSchema = successResultSchema(z.array(creditTransactionSchema));
export const creditPurchasesResponseSchema = successResultSchema(z.array(creditPurchaseSchema));
export const billingStatsResponseSchema = successResultSchema(billingStatsSchema);
export const revenueDataResponseSchema = successResultSchema(z.array(revenuePointSchema));
export const transactionsDataResponseSchema = successResultSchema(transactionsListSchema);
export const purchasesDataResponseSchema = successResultSchema(purchasesListSchema);
export const transactionChartResponseSchema = successResultSchema(z.array(transactionPointSchema));
export const creditsConsumedChartResponseSchema = successResultSchema(z.array(creditsConsumedPointSchema));
export const userSubscriptionResponseSchema = successResultSchema(userSubscriptionSchema.nullable());
export const subscriptionPaymentsResponseSchema = successResultSchema(z.array(subscriptionPaymentSchema));
export const subscriptionsListResponseSchema = successResultSchema(subscriptionsListSchema);
export const subscriptionPaymentsListResponseSchema = successResultSchema(subscriptionPaymentsListSchema);
export const subscriptionStatsResponseSchema = successResultSchema(subscriptionStatsSchema);
export const subscriptionFinanceSummaryResponseSchema = successResultSchema(subscriptionFinanceSummarySchema);
export const adminSubscriptionFinanceDashboardResponseSchema = successResultSchema(adminSubscriptionFinanceDashboardSchema);
export const subscriptionPlanDistributionResponseSchema = successResultSchema(z.array(subscriptionPlanDistributionPointSchema));
export const subscriptionEventsResponseSchema = successResultSchema(z.array(subscriptionEventSchema));
export const applicationConfigResponseSchema = successResultSchema(applicationConfigSchema);
export const adminCreditsDashboardResponseSchema = successResultSchema(adminCreditsDashboardSchema);
export const adminCreditRefundResponseSchema = successResultSchema(adminCreditRefundResponseDataSchema);
export const adminSubscriptionRefundResponseSchema = successResultSchema(adminSubscriptionRefundResponseDataSchema);
export const apiKeysResponseSchema = successResultSchema(z.array(apiKeySummarySchema));
export const createApiKeyResponseSchema = successResultSchema(createApiKeyResponseDataSchema);
export const revokeApiKeyResponseSchema = successResultSchema(apiKeySummarySchema);

export const consumeCreditsResponseSchema = z.object({
  transactionId: z.string(),
  idempotencyKey: z.string(),
  balanceBefore: z.string(),
  balanceAfter: z.string(),
  alreadyProcessed: z.boolean(),
});

export type ConsumeCreditsResponse = z.infer<typeof consumeCreditsResponseSchema>;

export const consumeCreditsApiResponseSchema = successResultSchema(consumeCreditsResponseSchema);

export type CreditBalance = z.infer<typeof creditBalanceSchema>;
export type CreditTransaction = z.infer<typeof creditTransactionSchema>;
export type CreditPurchase = z.infer<typeof creditPurchaseSchema>;
export type BillingStats = z.infer<typeof billingStatsSchema>;
export type RevenuePoint = z.infer<typeof revenuePointSchema>;
export type TransactionPoint = z.infer<typeof transactionPointSchema>;
export type CreditsConsumedPoint = z.infer<typeof creditsConsumedPointSchema>;
export type TransactionsList = z.infer<typeof transactionsListSchema>;
export type PurchasesList = z.infer<typeof purchasesListSchema>;
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;
export type UserSubscription = z.infer<typeof userSubscriptionSchema>;
export type SubscriptionPayment = z.infer<typeof subscriptionPaymentSchema>;
export type AdminSubscriptionPaymentListItem = z.infer<typeof adminSubscriptionPaymentListItemSchema>;
export type SubscriptionsList = z.infer<typeof subscriptionsListSchema>;
export type SubscriptionPaymentsList = z.infer<typeof subscriptionPaymentsListSchema>;
export type SubscriptionStats = z.infer<typeof subscriptionStatsSchema>;
export type SubscriptionFinanceSummary = z.infer<typeof subscriptionFinanceSummarySchema>;
export type AdminSubscriptionFinanceDashboard = z.infer<typeof adminSubscriptionFinanceDashboardSchema>;
export type SubscriptionPlanDistributionPoint = z.infer<typeof subscriptionPlanDistributionPointSchema>;
export type SubscriptionEvent = z.infer<typeof subscriptionEventSchema>;
export type ApplicationConfig = z.infer<typeof applicationConfigSchema>;
export type AdminBillingWarning = z.infer<typeof adminBillingWarningSchema>;
export type AdminBillingPagination = z.infer<typeof adminBillingPaginationSchema>;
export type AdminCreditsDashboard = z.infer<typeof adminCreditsDashboardSchema>;
export type AdminRefund = z.infer<typeof adminRefundSchema>;
export type AdminCreditRefundResponseData = z.infer<typeof adminCreditRefundResponseDataSchema>;
export type AdminSubscriptionRefundResponseData = z.infer<typeof adminSubscriptionRefundResponseDataSchema>;
export type ApiKeySummary = z.infer<typeof apiKeySummarySchema>;
export type CreateApiKeyResponseData = z.infer<typeof createApiKeyResponseDataSchema>;
