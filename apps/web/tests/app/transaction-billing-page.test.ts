import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionBasket, TransactionEntitlement, TransactionOrder } from "@platform/contracts";

const { TransactionBillingPortal } = vi.hoisted(() => ({
  TransactionBillingPortal: vi.fn(() => null),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/lib/auth-session", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/api/me.server", () => ({
  getCountriesServer: vi.fn(),
  getCreditPurchasesServer: vi.fn(),
  getMyApplicationConfigServer: vi.fn(),
  getMySubscriptionPaymentsServer: vi.fn(),
  getMySubscriptionServer: vi.fn(),
  getMyTransactionBasketServer: vi.fn(),
  getMyTransactionEntitlementsServer: vi.fn(),
  getMyTransactionOrdersServer: vi.fn(),
  getUserProfileAddressServer: vi.fn(),
}));
vi.mock("@/components/layout/backend/billing/transaction-billing-portal", () => ({ TransactionBillingPortal }));
vi.mock("@/components/layout/backend/billing/purchase-history", () => ({ PurchaseHistory: vi.fn() }));
vi.mock("@/components/layout/backend/billing/credit-pricing", () => ({ CreditPricing: vi.fn() }));
vi.mock("@/components/layout/backend/billing/transaction-history", () => ({ TableSkeleton: vi.fn(), TransactionHistory: vi.fn() }));
vi.mock("@/components/layout/backend/billing/subscription-pricing", () => ({ SubscriptionPricing: vi.fn() }));
vi.mock("@/components/layout/backend/billing/subscription-status", () => ({ SubscriptionStatus: vi.fn() }));
vi.mock("@/components/layout/backend/billing/subscription-history", () => ({ SubscriptionHistory: vi.fn() }));
vi.mock("../../src/app/[locale]/(backend)/billing/client-wrapper", () => ({ BillingClientWrapper: vi.fn() }));
vi.mock("../../src/app/[locale]/(backend)/billing/subscription-client-wrapper", () => ({ SubscriptionBillingClientWrapper: vi.fn() }));

import BillingPage from "../../src/app/[locale]/(backend)/billing/page";
import {
  getCreditPurchasesServer,
  getMyApplicationConfigServer,
  getMyTransactionBasketServer,
  getMyTransactionEntitlementsServer,
  getMyTransactionOrdersServer,
} from "../../src/lib/api/me.server";
import { getServerSession } from "../../src/lib/auth-session";

describe("transaction billing page mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user-1" } } as Awaited<ReturnType<typeof getServerSession>>);
    vi.mocked(getMyApplicationConfigServer).mockResolvedValue({
      billing: {
        enabled: true,
        mode: "transactions",
        creditSurfacesEnabled: true,
        subscriptionSurfacesEnabled: false,
        transactionSurfacesEnabled: true,
      },
      features: { vouchers: false, discounts: false, notifications: true },
      ui: {
        notificationsDropdownLimit: 5,
        notificationsPollingIntervalMs: 30_000,
        deleteAccountCountdownSeconds: 10,
      },
    });
  });

  it("loads transaction data and returns the transaction portal before credit fallback", async () => {
    const basket: TransactionBasket = { id: "basket-1", status: "draft", currency: null, totalAmount: 0, items: [] };
    const orders: TransactionOrder[] = [];
    const entitlements: TransactionEntitlement[] = [];
    vi.mocked(getMyTransactionBasketServer).mockResolvedValue(basket);
    vi.mocked(getMyTransactionOrdersServer).mockResolvedValue(orders);
    vi.mocked(getMyTransactionEntitlementsServer).mockResolvedValue(entitlements);

    const element = await BillingPage({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({}) });

    expect(element).not.toBeNull();
    expect(element).toMatchObject({
      type: TransactionBillingPortal,
      props: { userId: "user-1", initialBasket: basket, initialOrders: orders, initialEntitlements: entitlements },
    });
    expect(getCreditPurchasesServer).not.toHaveBeenCalled();
  });
});
