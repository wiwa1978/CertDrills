import { createElement, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplicationConfig } from "@platform/contracts";
import { queryKeys } from "@platform/frontend-shared/query-keys";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({ getMyApplicationConfig: vi.fn() }));
vi.mock("@/lib/api/me", () => ({ getMyApplicationConfig: apiMocks.getMyApplicationConfig }));

import { DashboardNavProvider, useDashboardNav, type DashboardNavItem } from "../../src/components/providers/backend-nav-provider";
import { createApplicationConfigSnapshot, matchesApplicationConfigSnapshot } from "../../src/components/providers/application-config-seed";

const initialApplicationConfig = {
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
const disabledApplicationConfig = {
  ...initialApplicationConfig,
  billing: {
    ...initialApplicationConfig.billing,
    mode: "credits" as const,
    transactionSurfacesEnabled: false,
    creditSurfacesEnabled: false,
  },
};

let navItems: DashboardNavItem[] = [];
let userDropdownNavItems: DashboardNavItem[] = [];
const originalConsoleError = console.error;
let consoleError: ReturnType<typeof vi.spyOn>;

function NavHarness() {
  const nav = useDashboardNav();
  useEffect(() => {
    navItems = nav.navItems;
    userDropdownNavItems = nav.userDropdownNavItems;
  }, [nav]);
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  navItems = [];
  userDropdownNavItems = [];
  apiMocks.getMyApplicationConfig.mockRejectedValue(new Error("client config unavailable"));
  consoleError = vi.spyOn(console, "error").mockImplementation((message, ...args) => {
    if (message === "react-test-renderer is deprecated. See https://react.dev/warnings/react-test-renderer") return;
    originalConsoleError(message, ...args);
  });
});

afterEach(() => {
  consoleError.mockRestore();
  vi.restoreAllMocks();
});

describe("dashboard nav provider", () => {
  it("keeps server-configured billing navigation after a client refetch error", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          DashboardNavProvider,
          { initialApplicationConfig, children: createElement(NavHarness) },
        ),
      ));
    });

    expect(navItems).toEqual(expect.arrayContaining([expect.objectContaining({ url: "/billing" })]));
    expect(userDropdownNavItems).toEqual(expect.arrayContaining([expect.objectContaining({ url: "/billing" })]));

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.me.applicationConfig });
    });

    expect(apiMocks.getMyApplicationConfig).toHaveBeenCalledOnce();
    expect(navItems).toEqual(expect.arrayContaining([expect.objectContaining({ url: "/billing" })]));
    expect(userDropdownNavItems).toEqual(expect.arrayContaining([expect.objectContaining({ url: "/billing" })]));
    expect(queryClient.getQueryData(queryKeys.me.applicationConfig)).toEqual(initialApplicationConfig);
    act(() => renderer.unmount());
  });

  it("prefers fresh server config over stale mount cache and seeds the shared cache", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    queryClient.setQueryData(queryKeys.me.applicationConfig, disabledApplicationConfig);
    let renderer!: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(DashboardNavProvider, {
          initialApplicationConfig,
          children: createElement(NavHarness),
        }),
      ));
    });

    expect(navItems).toEqual(expect.arrayContaining([expect.objectContaining({ url: "/billing" })]));
    expect(queryClient.getQueryData(queryKeys.me.applicationConfig)).toEqual(initialApplicationConfig);
    act(() => renderer.unmount());
  });

  it("does not overwrite a client config result that arrives after mount", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    queryClient.setQueryData(queryKeys.me.applicationConfig, disabledApplicationConfig);
    const clientConfig = { ...initialApplicationConfig, features: { ...initialApplicationConfig.features, vouchers: true } };
    let renderer!: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(DashboardNavProvider, {
          initialApplicationConfig,
          children: createElement(NavHarness),
        }),
      ));
    });
    await act(async () => {
      queryClient.setQueryData(queryKeys.me.applicationConfig, clientConfig);
    });

    expect(queryClient.getQueryData(queryKeys.me.applicationConfig)).toEqual(clientConfig);
    act(() => renderer.unmount());
  });

  it("detects a post-mount config update against the captured snapshot", () => {
    const snapshot = createApplicationConfigSnapshot(disabledApplicationConfig, 100);

    expect(matchesApplicationConfigSnapshot(snapshot, disabledApplicationConfig, 100)).toBe(true);
    expect(matchesApplicationConfigSnapshot(snapshot, initialApplicationConfig, 101)).toBe(false);
  });

  it("degrades without crashing when server config is absent and client config fails", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let renderer!: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(DashboardNavProvider, {
          initialApplicationConfig: undefined,
          children: createElement(NavHarness),
        }),
      ));
    });

    expect(navItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: "/dashboard" }),
      expect.objectContaining({ url: "/exams" }),
      expect.objectContaining({ url: "/profile/attempts" }),
    ]));
    expect(userDropdownNavItems).toEqual([expect.objectContaining({ url: "/settings" })]);
    act(() => renderer.unmount());
  });
});
