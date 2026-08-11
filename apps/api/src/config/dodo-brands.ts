import type { BillingMode } from "./application";

export const DODO_BRAND_ENV_BY_BILLING_MODE = {
  credits: "DODO_CREDITS_BRAND_ID",
  subscriptions: "DODO_SUBSCRIPTIONS_BRAND_ID",
  transactions: "DODO_TRANSACTIONS_BRAND_ID",
} as const satisfies Record<BillingMode, string>;

export type DodoBrandConfig = Partial<Record<BillingMode, string>>;

type DodoBrandEnvironment = Partial<Record<(typeof DODO_BRAND_ENV_BY_BILLING_MODE)[BillingMode], string>>;

export function dodoBrandsFromEnvironment(environment: DodoBrandEnvironment): DodoBrandConfig {
  return {
    credits: environment.DODO_CREDITS_BRAND_ID,
    subscriptions: environment.DODO_SUBSCRIPTIONS_BRAND_ID,
    transactions: environment.DODO_TRANSACTIONS_BRAND_ID,
  };
}
