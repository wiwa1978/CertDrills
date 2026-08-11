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
    providerProductIds: { dodo: "pdt_0NkioAYLMGksqZtDhLXGA" },
    features: ["Core app access"],
  },
  Silver: {
    price: 2500,
    currency: "EUR",
    interval: "month",
    providerProductIds: { dodo: "pdt_0NkioAab5uELkXMGi8T7F" },
    features: ["Core app access"],
  },
  Gold: {
    price: 5000,
    currency: "EUR",
    interval: "month",
    providerProductIds: { dodo: "pdt_0NkioAcnp3bOBNvazFR7y" },
    popular: true,
    features: ["Core app access", "Priority support"],
  },
} as const satisfies SubscriptionPlanConfig;

export type SubscriptionPlanKey = keyof typeof SUBSCRIPTION_PLANS;

export const SUBSCRIPTION_PLAN_DEFINITIONS: Record<SubscriptionPlanKey, SubscriptionPlanDefinition> = SUBSCRIPTION_PLANS;
