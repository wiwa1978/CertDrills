import type { CreditBalance, CreditPurchase, CreditTransaction, SuccessResult } from "@platform/contracts";

export type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

type InvoiceDownloadResponse = { success: boolean; invoiceUrl?: string; error?: string };
export type UserCreditPurchase = CreditPurchase & { paymentId: string };

export function createCreditsApi(apiRequest: ApiRequest) {
  return {
    async getBalance() {
      return apiRequest<SuccessResult<CreditBalance>>("/me/credits/balance");
    },
    async getHistory(limit = 50) {
      return apiRequest<SuccessResult<CreditTransaction[]>>(`/me/credits/history?limit=${encodeURIComponent(String(limit))}`);
    },
    async getPurchases(limit = 50) {
      return apiRequest<SuccessResult<UserCreditPurchase[]>>(`/me/credits/purchases?limit=${encodeURIComponent(String(limit))}`);
    },
    async downloadInvoice(paymentId: string) {
      return apiRequest<InvoiceDownloadResponse>("/me/credits/invoice", {
        method: "POST",
        body: JSON.stringify({ paymentId }),
      });
    },
  };
}
