import { createCreditsApi } from "@platform/frontend-shared/credits";
import { createNotificationsApi } from "@platform/frontend-shared/notifications";
import { createMeApi } from "@platform/frontend-shared/me-api";
import type { ApplicationConfig, CreditPurchase, CreditTransaction } from "@platform/contracts";

import { serverApiRequest } from "./client.server";

const creditsApi = createCreditsApi(serverApiRequest);
const meApi = createMeApi(serverApiRequest);
const notificationsApi = createNotificationsApi(serverApiRequest);

export async function getMyApplicationConfigServer() {
  const result = await meApi.getApplicationConfig() as { success: boolean; data: ApplicationConfig };
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
