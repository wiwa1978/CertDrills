import { createCreditsApi } from "@platform/frontend-shared/credits";
import { createMeApi, type CheckoutAddressInput, type CountryRecord, type CreateUserDataExportResponse, type UserDataExportSummary } from "@platform/frontend-shared/me-api";
import { createNotificationsApi } from "@platform/frontend-shared/notifications";

import { API_BASE_URL, apiRequest } from "./client";
import type { Notification } from "@/schemas/notification";
import type { ApplicationConfig, SubscriptionPayment, UserSubscription } from "@platform/contracts";
import type {
  ApiKeyScope,
  ApiKeySummary,
  CreateApiKeyResponseData,
} from "@platform/contracts";
import { apiRoutes } from "@platform/contracts/ts";

export type { CountryRecord } from "@platform/frontend-shared/me-api";
export type { CheckoutAddressInput } from "@platform/frontend-shared/me-api";
export type { CreateUserDataExportResponse, UserDataExportSummary } from "@platform/frontend-shared/me-api";

const creditsApi = createCreditsApi(apiRequest);
const notificationsApi = createNotificationsApi(apiRequest);
const meApi = createMeApi(apiRequest);

export async function getMyCreditBalance() {
  const result = await creditsApi.getBalance() as { success: boolean; data: unknown };
  return result.data;
}

export async function getMyApplicationConfig() {
  const result = await meApi.getApplicationConfig() as { success: boolean; data: ApplicationConfig };
  return result.data;
}

export async function getMySubscription() {
  const result = await meApi.getSubscription() as { success: boolean; data: UserSubscription | null };
  return result.data;
}

export async function getMySubscriptionPayments(limit = 50) {
  const result = await meApi.getSubscriptionPayments(limit) as { success: boolean; data: SubscriptionPayment[] };
  return result.data;
}

export async function downloadMySubscriptionInvoice(paymentId: string) {
  return meApi.downloadSubscriptionInvoice(paymentId) as Promise<{ success: boolean; invoiceUrl?: string; error?: string }>;
}

export async function getMyCreditHistory(limit = 50) {
  const result = await creditsApi.getHistory(limit) as { success: boolean; data: unknown };
  return result.data;
}

export async function getMyCreditPurchases(limit = 50) {
  const result = await creditsApi.getPurchases(limit) as { success: boolean; data: unknown };
  return result.data;
}

export async function downloadMyInvoice(paymentId: string) {
  return creditsApi.downloadInvoice(paymentId) as Promise<{ success: boolean; invoiceUrl?: string; error?: string }>;
}

export async function redeemMyVoucher(code: string) {
  return meApi.redeemVoucher(code) as Promise<{
    success: boolean;
    creditsAdded?: number;
    newBalance?: number;
    error?: string;
  }>;
}

export async function getMyNotifications(limit = 20) {
  const result = await notificationsApi.list(limit) as { success: boolean; data: unknown };
  return result.data;
}

export async function getMyActiveBannerNotification() {
  const result = await notificationsApi.getActiveBanner() as { success: boolean; data: Notification | null };
  return result.data;
}

export async function getMyUnreadNotificationsCount() {
  const result = await notificationsApi.getUnreadCount() as { success: boolean; data: { count: number } };
  return result.data.count;
}

export async function markMyNotificationAsRead(notificationId: string) {
  return notificationsApi.markAsRead(notificationId) as Promise<{ success: boolean; data: { marked: boolean } }>;
}

export async function markAllMyNotificationsAsRead() {
  return notificationsApi.markAllAsRead() as Promise<{ success: boolean; data: { marked: boolean } }>;
}

export async function deleteMyNotification(notificationId: string) {
  return notificationsApi.delete(notificationId) as Promise<{ success: boolean; data: { deleted: boolean } }>;
}

export async function getCountries(lang: "en" | "fr" | "nl") {
  return meApi.getCountries(lang) as Promise<CountryRecord[]>;
}

export async function createCheckoutSession(input: { packageKey: string; discountCode?: string; address?: CheckoutAddressInput }) {
  return meApi.createCheckoutSession(input.packageKey, input.discountCode, input.address) as Promise<{ success: boolean; data: { checkoutUrl: string } }>;
}

export async function createSubscriptionCheckoutSession(input: { planKey: string; discountCode?: string; address?: CheckoutAddressInput }) {
  return meApi.createSubscriptionCheckoutSession(input.planKey, input.discountCode, input.address) as Promise<{ success: boolean; data: { checkoutUrl: string } }>;
}

export async function createCustomerPortalSession() {
  return meApi.createCustomerPortalSession() as Promise<{ success: boolean; data: { portalUrl: string } }>;
}

export async function listMyDataExports() {
  const result = await meApi.listDataExports() as { success: boolean; data: UserDataExportSummary[] };
  return result.data;
}

export async function createMyDataExport() {
  return meApi.createDataExport() as Promise<{ success: boolean; data?: CreateUserDataExportResponse; error?: string }>;
}

export async function cancelMyDataExport(exportId: string) {
  return meApi.cancelDataExport(exportId) as Promise<{ success: boolean; data?: UserDataExportSummary; error?: string }>;
}

export async function downloadMyDataExport(exportId: string, token: string) {
  const response = await fetch(`${API_BASE_URL}/me/data-exports/${encodeURIComponent(exportId)}/download`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { "x-data-export-token": token },
  });
  if (!response.ok) throw new Error(`Data export download failed (${response.status})`);
  return response.blob();
}

export async function listMyApiKeys() {
  const result = await apiRequest<{ success: boolean; data: ApiKeySummary[] }>(apiRoutes.me.apiKeys);
  return result.data;
}

export async function createMyApiKey(payload: { name: string; scopes: ApiKeyScope[]; expiresAt?: string }) {
  const result = await apiRequest<{ success: boolean; data: CreateApiKeyResponseData }>(apiRoutes.me.apiKeys, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function revokeMyApiKey(keyId: string) {
  const result = await apiRequest<{ success: boolean; data: ApiKeySummary }>(apiRoutes.me.apiKey(keyId), {
    method: "DELETE",
  });
  return result.data;
}

export async function getMyTransactionBasket() {
  const result = await meApi.getTransactionBasket();
  return result.data;
}

export async function upsertMyTransactionBasketItem(input: { productKey: string; quantity: number }) {
  return meApi.upsertTransactionBasketItem(input.productKey, input.quantity);
}

export async function removeMyTransactionBasketItem(productKey: string) {
  return meApi.removeTransactionBasketItem(productKey);
}

export async function clearMyTransactionBasket() {
  return meApi.clearTransactionBasket();
}

export async function createMyTransactionCheckout() {
  return meApi.createTransactionCheckout();
}

export async function getMyTransactionOrders() {
  const result = await meApi.getTransactionOrders();
  return result.data;
}

export async function getMyTransactionOrder(orderId: string) {
  const result = await meApi.getTransactionOrder(orderId);
  return result.data;
}

export async function getMyTransactionEntitlements() {
  const result = await meApi.getTransactionEntitlements();
  return result.data;
}

export type { TransactionBasket, TransactionCheckout, TransactionEntitlement, TransactionOrder } from "@platform/contracts";
