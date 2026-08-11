export { creditBillingConfig } from "@platform/contracts";

import { productDefinition } from "../composition/product";

export type CreditPackage = {
  key: string;
  credits: number;
  price: number;
  currency: string;
  providerProductIds: Record<string, string>;
  bonus: number;
  popular: boolean;
};
export type SubscriptionPlan = {
  key: string;
  price: number;
  currency: string;
  interval: "month" | "year";
  providerProductIds: Record<string, string>;
  popular: boolean;
  features: readonly string[];
};
export type TransactionProduct = {
  key: string;
  price: number;
  currency: string;
  providerProductIds: Record<string, string>;
  active: boolean;
  fulfillmentType: string;
  name: string;
  description?: string;
};

export const creditPackages: readonly CreditPackage[] = productDefinition.billing.credits;
export const subscriptionPlans: readonly SubscriptionPlan[] = productDefinition.billing.subscriptions;
export const transactionProducts: readonly TransactionProduct[] = productDefinition.billing.transactions;
