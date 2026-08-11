import { creditBillingConfig, CREDIT_PLAN_DEFINITIONS, type CreditPlanKey } from "./credit-plans";

export { creditBillingConfig };

export const creditPackages = (Object.keys(CREDIT_PLAN_DEFINITIONS) as CreditPlanKey[]).map((key) => {
  const plan = CREDIT_PLAN_DEFINITIONS[key];

  return {
    key,
    credits: plan.credits,
    price: plan.price,
    currency: plan.currency,
    providerProductIds: plan.providerProductIds,
    bonus: plan.bonus ?? 0,
    popular: plan.popular ?? false,
  };
});

export type CreditPackage = typeof creditPackages[number];
