import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplicationConfig } from "@platform/contracts";

const providerMocks = vi.hoisted(() => ({
  DashboardNavProvider: vi.fn(),
  TransactionCartProvider: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth-session", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/api/me.server", () => ({ getMyApplicationConfigForLayoutServer: vi.fn() }));
vi.mock("@/components/providers/backend-nav-provider", () => ({ DashboardNavProvider: providerMocks.DashboardNavProvider }));
vi.mock("@/components/providers/transaction-cart-provider", () => ({ TransactionCartProvider: providerMocks.TransactionCartProvider }));
vi.mock("@/components/layout/backend/shared/dashboard-sidebar", () => ({ DashboardSidebar: vi.fn() }));
vi.mock("@/components/layout/backend/shared/backend-banner-notification", () => ({ BackendBannerNotification: vi.fn() }));

import DashboardLayout from "../../src/app/[locale]/(backend)/layout";
import { DashboardNavProvider } from "../../src/components/providers/backend-nav-provider";
import { TransactionCartProvider } from "../../src/components/providers/transaction-cart-provider";
import { getMyApplicationConfigForLayoutServer } from "../../src/lib/api/me.server";
import { getServerSession } from "../../src/lib/auth-session";

const applicationConfig = {
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
} satisfies ApplicationConfig;

describe("backend layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user-1" } } as Awaited<ReturnType<typeof getServerSession>>);
    vi.mocked(getMyApplicationConfigForLayoutServer).mockResolvedValue(applicationConfig);
  });

  it("fetches application config after authentication and passes it to both providers", async () => {
    const element = await DashboardLayout({ children: "content", params: Promise.resolve({ locale: "en" }) });
    const cartProvider = element.props.children;

    expect(getMyApplicationConfigForLayoutServer).toHaveBeenCalledOnce();
    expect(vi.mocked(getServerSession).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(getMyApplicationConfigForLayoutServer).mock.invocationCallOrder[0],
    );
    expect(element).toMatchObject({
      type: DashboardNavProvider,
      props: { initialApplicationConfig: applicationConfig },
    });
    expect(cartProvider).toMatchObject({
      type: TransactionCartProvider,
      props: { userId: "user-1", initialApplicationConfig: applicationConfig },
    });
  });

  it("renders with absent initial config when the safe server lookup fails", async () => {
    vi.mocked(getMyApplicationConfigForLayoutServer).mockResolvedValue(undefined);

    const element = await DashboardLayout({ children: null, params: Promise.resolve({ locale: "en" }) });
    expect(element.props.initialApplicationConfig).toBeUndefined();
    expect(element.props.children.props.initialApplicationConfig).toBeUndefined();
  });
});
