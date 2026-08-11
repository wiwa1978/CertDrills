import { createCreditsApi } from "@platform/frontend-shared/credits";
import { createMeApi, type CountryRecord, type UserProfileAddress } from "@platform/frontend-shared/me-api";
import { createNotificationsApi } from "@platform/frontend-shared/notifications";

import { serverApiRequest } from "./client.server";
import type { ApplicationConfig, CreditPurchase, CreditTransaction, SubscriptionPayment, UserSubscription } from "@platform/contracts";

const creditsApi = createCreditsApi(serverApiRequest);
const meApi = createMeApi(serverApiRequest);
const notificationsApi = createNotificationsApi(serverApiRequest);

export async function getMyApplicationConfigServer() {
  const result = await meApi.getApplicationConfig() as { success: boolean; data: ApplicationConfig };
  return result.data;
}

export async function getMyApplicationConfigForLayoutServer() {
  try {
    return await getMyApplicationConfigServer();
  } catch {
    return undefined;
  }
}

export async function getUserProfileAddressServer() {
  const result = await meApi.getProfileAddress() as { success: boolean; data: UserProfileAddress | null };
  return result.data;
}

export async function getCountriesServer(lang: "en" | "fr" | "nl") {
  return meApi.getCountries(lang) as Promise<CountryRecord[]>;
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

export async function getCreditHistoryServer(limit = 50) {
  const result = await creditsApi.getHistory(limit) as { success: boolean; data: CreditTransaction[] };
  return result.data;
}

export async function getActiveBannerNotificationsServer() {
  try {
    const result = await notificationsApi.getActiveBanner();
    return { success: true, data: result.data };
  } catch {
    return { success: false, data: null };
  }
}

export async function getCreditBalanceServer() {
  const result = await creditsApi.getBalance() as { success: boolean; data: { balance: number; totalSpent: number; totalPurchased: number; totalPurchasedAmount: number; totalPurchases: number } };
  return result.data;
}

export async function getMyTransactionBasketServer() {
  const result = await meApi.getTransactionBasket();
  return result.data;
}

export async function getMyTransactionOrdersServer() {
  const result = await meApi.getTransactionOrders();
  return result.data;
}

export async function getMyTransactionOrderServer(orderId: string) {
  const result = await meApi.getTransactionOrder(orderId);
  return result.data;
}

export async function getMyTransactionEntitlementsServer() {
  const result = await meApi.getTransactionEntitlements();
  return result.data;
}
