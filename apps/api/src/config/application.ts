export type BillingMode = "credits" | "subscriptions";

export const applicationConfig = {
  billing: {
    mode: "credits" as BillingMode,
  },
  features: {
    billing: true,
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
