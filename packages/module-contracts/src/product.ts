import type { CapabilityDefinition } from "./api";

export type BillingMode = "credits" | "subscriptions" | "transactions";

export type ProductPricedDefinition = {
  key: string;
  price: number;
  currency: string;
  providerProductIds: Record<string, string>;
};

export type ProductCreditDefinition = ProductPricedDefinition & {
  credits: number;
};

export type ProductTransactionDefinition = ProductPricedDefinition & {
  active: boolean;
  name: string;
  description?: string;
  fulfillmentType: string;
};

export type ProductSubscriptionDefinition = ProductPricedDefinition & {
  interval: "month" | "year";
  features?: readonly string[];
};

export type PlatformProductDefinition = {
  id: string;
  displayName: string;
  billing: {
    enabled: boolean;
    mode: BillingMode | null;
    credits?: readonly ProductCreditDefinition[];
    subscriptions?: readonly ProductSubscriptionDefinition[];
    transactions?: readonly ProductTransactionDefinition[];
  };
  capabilities: readonly CapabilityDefinition[];
};
