import type { ApiRequest } from "./credits";
import type {
  ApplicationConfig,
  CreateCheckoutResponse,
  SubscriptionPayment,
  SuccessResult,
  TransactionBasket,
  TransactionCheckout,
  TransactionEntitlement,
  TransactionOrder,
  UserSubscription,
} from "@platform/contracts";
import { apiRoutes } from "@platform/contracts/ts";

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

export type CheckoutAddressInput = {
  street: string;
  number: string;
  zipcode: string;
  town: string;
  countryId: string;
};

export type UserProfileAddress = {
  street: string | null;
  number: string | null;
  zipcode: string | null;
  town: string | null;
  countryId: string | null;
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
      return apiRequest(apiRoutes.me.session);
    },
    async getApplicationConfig() {
      return apiRequest<{ success: boolean; data: ApplicationConfig }>(apiRoutes.me.applicationConfig);
    },
    async getProfileAddress() {
      return apiRequest<{ success: boolean; data: UserProfileAddress | null }>(apiRoutes.me.profileAddress);
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
    async createCheckoutSession(packageKey: string, discountCode?: string, address?: CheckoutAddressInput) {
      const body = {
        packageKey,
        ...(discountCode ? { discountCode } : {}),
        ...(address ? { address } : {}),
      };

      return apiRequest<CreateCheckoutResponse>("/payments/checkout", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    async createSubscriptionCheckoutSession(planKey: string, discountCode?: string, address?: CheckoutAddressInput) {
      const body = {
        billingMode: "subscriptions",
        planKey,
        ...(discountCode ? { discountCode } : {}),
        ...(address ? { address } : {}),
      };

      return apiRequest<CreateCheckoutResponse>("/payments/checkout", {
        method: "POST",
        body: JSON.stringify(body),
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
    async getTransactionBasket() {
      return apiRequest<SuccessResult<TransactionBasket>>(apiRoutes.me.transactionBasket);
    },
    async upsertTransactionBasketItem(productKey: string, quantity: number) {
      return apiRequest<SuccessResult<TransactionBasket>>(apiRoutes.me.transactionBasketItems, {
        method: "PUT",
        body: JSON.stringify({ productKey, quantity }),
      });
    },
    async removeTransactionBasketItem(productKey: string) {
      return apiRequest<SuccessResult<TransactionBasket>>(apiRoutes.me.transactionBasketItem(productKey), {
        method: "DELETE",
      });
    },
    async clearTransactionBasket() {
      return apiRequest<SuccessResult<TransactionBasket>>(apiRoutes.me.transactionBasket, {
        method: "DELETE",
      });
    },
    async createTransactionCheckout() {
      return apiRequest<SuccessResult<TransactionCheckout>>(apiRoutes.me.transactionCheckout, {
        method: "POST",
      });
    },
    async getTransactionOrders() {
      return apiRequest<SuccessResult<TransactionOrder[]>>(apiRoutes.me.transactionOrders);
    },
    async getTransactionOrder(orderId: string) {
      return apiRequest<SuccessResult<TransactionOrder>>(apiRoutes.me.transactionOrder(orderId));
    },
    async getTransactionEntitlements() {
      return apiRequest<SuccessResult<TransactionEntitlement[]>>(apiRoutes.me.transactionEntitlements);
    },
  };
}
