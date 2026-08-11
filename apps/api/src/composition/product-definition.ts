import type { PlatformProductDefinition } from "@platform/module-contracts";

const creditPackages = [
  { key: "starter", credits: 5, price: 500, currency: "EUR", providerProductIds: { dodo: "pdt_0NkioAPBxU4NKmFYXcjqo" }, bonus: 0, popular: false },
  { key: "advanced", credits: 10, price: 1000, currency: "EUR", providerProductIds: { dodo: "pdt_0NkioARiMUT4Q1jXQPqZF" }, bonus: 0, popular: true },
  { key: "pro", credits: 25, price: 2500, currency: "EUR", providerProductIds: { dodo: "pdt_0NkioATqYziYInEZ4cwFQ" }, bonus: 0, popular: false },
  { key: "max", credits: 50, price: 5000, currency: "EUR", providerProductIds: { dodo: "pdt_0NkioAW6Ke3fUtKNtnw16" }, bonus: 0, popular: false },
] as const;

const subscriptionPlans = [
  { key: "Bronze", price: 1000, currency: "EUR", interval: "month", providerProductIds: { dodo: "pdt_0NkioAYLMGksqZtDhLXGA" }, popular: false, features: ["Core app access"] },
  { key: "Silver", price: 2500, currency: "EUR", interval: "month", providerProductIds: { dodo: "pdt_0NkioAab5uELkXMGi8T7F" }, popular: false, features: ["Core app access"] },
  { key: "Gold", price: 5000, currency: "EUR", interval: "month", providerProductIds: { dodo: "pdt_0NkioAcnp3bOBNvazFR7y" }, popular: true, features: ["Core app access", "Priority support"] },
] as const;

const transactionProducts = [
  { key: "starterContent", price: 500, currency: "EUR", providerProductIds: { dodo: "pdt_0NkelzQ34bErNUPhvbEMi" }, active: true, fulfillmentType: "entitlement", name: "Starter content access", description: "One durable entitlement for the starter content product." },
  { key: "premiumContent", price: 1000, currency: "EUR", providerProductIds: { dodo: "pdt_0NkemCz5vlamLJsyCb4I2" }, active: true, fulfillmentType: "entitlement", name: "Premium content access", description: "One durable entitlement for the premium content product." },
] as const;

const productCapabilities = [
  { key: "aiGeneration", defaultAccess: "allowed", consumption: "credits", creditCost: 1 },
  { key: "apiCall", defaultAccess: "allowed", consumption: "credits", creditCost: 0.1 },
  { key: "exportPdf", defaultAccess: "allowed", consumption: "credits", creditCost: 5 },
  { key: "prioritySupport", defaultAccess: "denied", consumption: "none", grants: { plans: ["Gold"] } },
  { key: "chatText", defaultAccess: "allowed", consumption: "credits", creditCost: 0.1 },
  { key: "chatAudio", defaultAccess: "allowed", consumption: "credits", creditCost: 1 },
  { key: "chatVideo", defaultAccess: "allowed", consumption: "credits", creditCost: 2 },
] as const;

export const productDefinition = {
  id: "certdrills",
  displayName: "CertDrills",
  billing: {
    enabled: true,
    mode: "transactions",
    credits: creditPackages,
    subscriptions: subscriptionPlans,
    transactions: transactionProducts,
  },
  capabilities: [
    ...productCapabilities,
    { key: "coreAccess", defaultAccess: "denied", consumption: "none", grants: { plans: ["Bronze", "Silver", "Gold"] } },
    { key: "starterContent.access", defaultAccess: "denied", consumption: "entitlement", grants: { transactionProducts: ["starterContent"] } },
    { key: "premiumContent.access", defaultAccess: "denied", consumption: "entitlement", grants: { transactionProducts: ["premiumContent"] } },
  ],
} as const satisfies PlatformProductDefinition;
