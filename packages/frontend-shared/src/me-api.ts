import type { ApiRequest } from "./credits";
import type { ApplicationConfig, CreateCheckoutResponse, SubscriptionPayment, UserSubscription } from "@platform/contracts";

type CustomerPortalResponse = {
  success: true;
  data: {
    portalUrl: string;
  };
};

export type CountryRecord = {
  id: string;
  name: string;
  code: string;
  language: string;
};

export type UserDataExportSummary = {
  id: string;
  status: "pending" | "ready" | "downloaded" | "expired" | "failed";
  fileName: string | null;
  fileSizeBytes: number | null;
  expiresAt: string | null;
  downloadedAt: string | null;
  failedReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CreateUserDataExportResponse = UserDataExportSummary & {
  downloadToken: string;
};

export function createMeApi(apiRequest: ApiRequest) {
  return {
    async getSession() {
      return apiRequest("/me/session");
    },
    async getApplicationConfig() {
      return apiRequest<{ success: boolean; data: ApplicationConfig }>("/me/application-config");
    },
    async getSubscription() {
      return apiRequest<{ success: boolean; data: UserSubscription | null }>("/me/subscription");
    },
    async getSubscriptionPayments(limit = 50) {
      return apiRequest<{ success: boolean; data: SubscriptionPayment[] }>(`/me/subscription/payments?limit=${encodeURIComponent(String(limit))}`);
    },
    async downloadSubscriptionInvoice(paymentId: string) {
      return apiRequest<{ success: boolean; invoiceUrl?: string; error?: string }>("/me/subscription/invoice", {
        method: "POST",
        body: JSON.stringify({ paymentId }),
      });
    },
    async redeemVoucher(code: string) {
      return apiRequest("/me/vouchers/redeem", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
    },
    async getCountries(lang: "en" | "fr" | "nl") {
      const result = await apiRequest<{ success: boolean; data: CountryRecord[] }>(`/countries?lang=${lang}`);
      return result.data;
    },
    async createCheckoutSession(packageKey: string) {
      return apiRequest<CreateCheckoutResponse>("/payments/checkout", {
        method: "POST",
        body: JSON.stringify({ packageKey }),
      });
    },
    async createSubscriptionCheckoutSession(planKey: string, discountCode?: string) {
      return apiRequest<CreateCheckoutResponse>("/payments/checkout", {
        method: "POST",
        body: JSON.stringify({ billingMode: "subscriptions", planKey, discountCode }),
      });
    },
    async createCustomerPortalSession() {
      return apiRequest<CustomerPortalResponse>("/me/customer-portal", {
        method: "POST",
      });
    },
    async listDataExports() {
      return apiRequest<{ success: boolean; data: UserDataExportSummary[] }>("/me/data-exports");
    },
    async createDataExport() {
      return apiRequest<{ success: boolean; data?: CreateUserDataExportResponse; error?: string }>("/me/data-exports", {
        method: "POST",
      });
    },
    async cancelDataExport(exportId: string) {
      return apiRequest<{ success: boolean; data?: UserDataExportSummary; error?: string }>(`/me/data-exports/${encodeURIComponent(exportId)}`, {
        method: "DELETE",
      });
    },
    async downloadDataExport(exportId: string, token: string) {
      return apiRequest<string>(`/me/data-exports/${encodeURIComponent(exportId)}/download?token=${encodeURIComponent(token)}`);
    },
  };
}
