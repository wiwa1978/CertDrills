import { createCreditsApi } from "@platform/frontend-shared/credits";
import { createMeApi } from "@platform/frontend-shared/me-api";

import { serverApiRequest } from "./client.server";
import type { ApplicationConfig, CreditPurchase, SubscriptionPayment, UserSubscription } from "@platform/contracts";

const creditsApi = createCreditsApi(serverApiRequest);
const meApi = createMeApi(serverApiRequest);

export async function getMyApplicationConfigServer() {
  const result = await meApi.getApplicationConfig() as { success: boolean; data: ApplicationConfig };
  return result.data;
}

export async function getMySubscriptionServer() {
  const result = await meApi.getSubscription() as { success: boolean; data: UserSubscription | null };
  return result.data;
}

export async function getMySubscriptionPaymentsServer(limit = 50) {
  const result = await meApi.getSubscriptionPayments(limit) as { success: boolean; data: SubscriptionPayment[] };
  return result.data;
}

export async function getCreditPurchasesServer(limit = 50) {
  const result = await creditsApi.getPurchases(limit) as { success: boolean; data: CreditPurchase[] };
  return result.data;
}

export async function getCreditBalanceServer() {
  const result = await creditsApi.getBalance() as { success: boolean; data: { balance: number; totalSpent: number; totalPurchased: number; totalPurchasedAmount: number; totalPurchases: number } };
  return result.data;
}
