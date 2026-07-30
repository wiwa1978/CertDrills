import { z } from "zod";

import { creditBillingConfig, creditPackages } from "@/config/billing";

export { creditBillingConfig, creditPackages };
export type { CreditBalance, CreditPurchase, CreditTransaction } from "@platform/contracts";

export type CreditPackage = typeof creditPackages[number];
export type BillingConfig = typeof creditBillingConfig;
export type FeatureType = keyof typeof creditBillingConfig.features;

export const creditUsageSchema = z.object({
  feature: z.enum(Object.keys(creditBillingConfig.features) as [string, ...string[]]),
  description: z.string().optional(),
});

export const creditPurchaseSchema = z.object({
  packageKey: z.enum(creditPackages.map((pkg) => pkg.key) as [string, ...string[]]),
  paymentId: z.string(),
});
