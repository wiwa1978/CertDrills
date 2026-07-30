import { SUBSCRIPTION_PLAN_DEFINITIONS, type SubscriptionPlanKey } from "./subscription-plans";

export const subscriptionPlans = (Object.keys(SUBSCRIPTION_PLAN_DEFINITIONS) as SubscriptionPlanKey[]).map((key) => {
  const plan = SUBSCRIPTION_PLAN_DEFINITIONS[key];

  return {
    key,
    price: plan.price,
    currency: plan.currency,
    interval: plan.interval,
    providerProductIds: plan.providerProductIds,
    popular: plan.popular ?? false,
    features: plan.features,
  };
});

export type SubscriptionPlan = typeof subscriptionPlans[number];
