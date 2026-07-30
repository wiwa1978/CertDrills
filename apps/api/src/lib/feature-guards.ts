import { applicationConfig, type ApplicationFeatureFlag } from "../config/application";
import { getBillingMode, type BillingMode } from "./billing-mode";

export function createFeatureDisabledError(feature: ApplicationFeatureFlag) {
  return new Error(`Feature disabled: ${feature}`);
}

export function createBillingModeDisabledError(mode: BillingMode) {
  return new Error(`Billing mode disabled: ${mode}`);
}

export function isBillingModeDisabledError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith("Billing mode disabled: ");
}

export function getBillingModeDisabledErrorMessage(error: unknown) {
  return isBillingModeDisabledError(error) ? error.message : null;
}

export function ensureFeatureEnabled(feature: ApplicationFeatureFlag) {
  if (!applicationConfig.features[feature]) {
    throw createFeatureDisabledError(feature);
  }
}

export function ensureBillingEnabled() {
  ensureFeatureEnabled("billing");
}

export function ensureCreditBillingEnabled() {
  ensureBillingEnabled();

  if (getBillingMode() !== "credits") {
    throw createBillingModeDisabledError("credits");
  }
}

export function ensureSubscriptionBillingEnabled() {
  ensureBillingEnabled();

  if (getBillingMode() !== "subscriptions") {
    throw createBillingModeDisabledError("subscriptions");
  }
}
