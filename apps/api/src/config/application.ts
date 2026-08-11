export type { BillingMode } from "@platform/module-contracts";
import type { BillingMode } from "@platform/module-contracts";

import { productDefinition } from "../composition/product-definition";

export const applicationConfig = {
  billing: {
    mode: productDefinition.billing.mode as BillingMode,
  },
  features: {
    billing: productDefinition.billing.enabled,
    notifications: true,
    discounts: true,
    vouchers: true,
  },
} as const;

export type ApplicationFeatureFlag = keyof typeof applicationConfig.features;

export function isFeatureEnabled(feature: ApplicationFeatureFlag) {
  return applicationConfig.features[feature];
}

export type ApplicationConfig = typeof applicationConfig;
