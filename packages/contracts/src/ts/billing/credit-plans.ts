export type CreditPlanDefinition = {
  credits: number;
  price: number;
  currency: string;
  providerProductIds: Record<string, string>;
  bonus?: number;
  popular?: boolean;
};

export type CreditPlanConfig = Record<string, CreditPlanDefinition>;

export type CreditBillingConfig = {
  features: Record<string, number>;
  lowCreditThreshold: number;
  allowNegativeCredits: boolean;
  maxCredits: number;
};

export const CREDIT_PLANS = {
  starter: {
    credits: 10,
    price: 1000,
    currency: "EUR",
    providerProductIds: { dodo: "pdt_0NeNL8fjHXLCTIYfvSxYu" },
  },
  advanced: {
    credits: 25,
    price: 2500,
    currency: "EUR",
    providerProductIds: { dodo: "pdt_0NeNLCAY7sLmCDqKfD2wK" },
    bonus: 5,
    popular: true,
  },
  pro: {
    credits: 50,
    price: 5000,
    currency: "EUR",
    providerProductIds: { dodo: "pdt_0NeNLF57Srgh8qy0lD1kG" },
    bonus: 20,
  },
} as const satisfies CreditPlanConfig;

export type CreditPlanKey = keyof typeof CREDIT_PLANS;

export const CREDIT_PLAN_DEFINITIONS: Record<CreditPlanKey, CreditPlanDefinition> = CREDIT_PLANS;

export const creditBillingConfig = {
  features: {
    aiGeneration: 1,
    apiCall: 0.1,
    exportPdf: 5,
    prioritySupport: 10,
    chatText: 0.1,
    chatAudio: 1,
    chatVideo: 2,
  },
  lowCreditThreshold: 10,
  allowNegativeCredits: false,
  maxCredits: 10000,
} as const satisfies CreditBillingConfig;
