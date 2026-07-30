import { creditPackages, subscriptionPlans } from "../config/billing";
import type { BillingMode } from "./billing-mode";

export function getDodoCheckoutProductsForBillingMode(mode: BillingMode) {
  const products = mode === "credits" ? creditPackages : subscriptionPlans;

  return products.map((product) => ({
    productId: product.providerProductIds.dodo,
    slug: product.key,
  }));
}
