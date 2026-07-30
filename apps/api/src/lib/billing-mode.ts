import { applicationConfig, type BillingMode } from "../config/application";

export type { BillingMode };

export function getBillingMode(): BillingMode {
  return applicationConfig.billing.mode;
}

export function isCreditBillingMode() {
  return getBillingMode() === "credits";
}

export function isSubscriptionBillingMode() {
  return getBillingMode() === "subscriptions";
}

export function shouldExposeCreditBillingSurfaces() {
  return applicationConfig.features.billing && isCreditBillingMode();
}
