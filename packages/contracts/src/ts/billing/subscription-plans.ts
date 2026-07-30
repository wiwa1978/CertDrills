export type SubscriptionPlanDefinition = {
  price: number;
  currency: string;
  interval: "month" | "year";
  providerProductIds: Record<string, string>;
  popular?: boolean;
  features: readonly string[];
};

export type SubscriptionPlanConfig = Record<string, SubscriptionPlanDefinition>;

export const SUBSCRIPTION_PLANS = {
  Bronze: {
    price: 1000,
    currency: "EUR",
    interval: "month",
    providerProductIds: { dodo: "pdt_0Ne6oYX9ZLK155nv6Q416" },
    features: ["Core app access"],
  },
  Silver: {
    price: 2500,
    currency: "EUR",
    interval: "month",
    providerProductIds: { dodo: "pdt_0Ne6obyEV22bwoKD6vyG1" },
    features: ["Core app access"],
  },
  Gold: {
    price: 5000,
    currency: "EUR",
    interval: "month",
    providerProductIds: { dodo: "pdt_0Ne6ofScB4Hiwef1kG9Wa" },
    popular: true,
    features: ["Core app access", "Priority support"],
  },
} as const satisfies SubscriptionPlanConfig;

export type SubscriptionPlanKey = keyof typeof SUBSCRIPTION_PLANS;

export const SUBSCRIPTION_PLAN_DEFINITIONS: Record<SubscriptionPlanKey, SubscriptionPlanDefinition> = SUBSCRIPTION_PLANS;
