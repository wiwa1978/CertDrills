import { createElement, StrictMode, useEffect, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplicationConfig, TransactionBasket } from "@platform/contracts";
import { queryKeys } from "@platform/frontend-shared/query-keys";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  clearMyTransactionBasket: vi.fn(),
  createMyTransactionCheckout: vi.fn(),
  getMyApplicationConfig: vi.fn(),
  getMyTransactionBasket: vi.fn(),
  removeMyTransactionBasketItem: vi.fn(),
  upsertMyTransactionBasketItem: vi.fn(),
}));
const authMocks = vi.hoisted(() => ({
  session: { data: { user: { id: "user-1" } }, isPending: false } as {
    data: { user: { id: string } } | null;
    isPending: boolean;
  },
}));
const toastMocks = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("../../src/lib/api/me", () => ({ ...apiMocks }));
vi.mock("../../src/lib/auth-client", () => ({ useSession: () => authMocks.session }));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));
vi.mock("sonner", () => ({ toast: toastMocks }));

import {
  EMPTY_TRANSACTION_BASKET,
  TransactionCartProvider,
  createTransactionCartMutationCallbacks,
  createTransactionQuantityState,
  getTransactionBasketQueryKey,
  getTransactionBasketTotalQuantity,
  isTransactionCartEnabled,
  isTransactionCartLifecycleCurrent,
  shouldSeedTransactionBasket,
  transactionQuantityReducer,
  useTransactionCart,
  type TransactionCartContextValue,
} from "../../src/components/providers/transaction-cart-provider";
import { TransactionBillingPortal } from "../../src/components/layout/backend/billing/transaction-billing-portal";
import { TransactionProductCatalog } from "../../src/components/layout/backend/billing/transaction-product-catalog";

const originalConsoleError = console.error;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  currentCart = undefined;
  authMocks.session = { data: { user: { id: "user-1" } }, isPending: false };
  apiMocks.getMyTransactionBasket.mockResolvedValue(EMPTY_TRANSACTION_BASKET);
  consoleError = vi.spyOn(console, "error").mockImplementation((message, ...args) => {
    if (message === "react-test-renderer is deprecated. See https://react.dev/warnings/react-test-renderer") return;
    originalConsoleError(message, ...args);
  });
});

afterEach(() => {
  consoleError.mockRestore();
  Reflect.deleteProperty(globalThis, "window");
});

const basket: TransactionBasket = {
  id: "basket-1",
  status: "draft",
  currency: "EUR",
  totalAmount: 2500,
  items: [
    {
      id: "item-1",
      productKey: "starterContent",
      quantity: 2,
      unitPrice: 500,
      totalAmount: 1000,
      currency: "EUR",
      name: "Starter content access",
      description: "Starter access",
    },
    {
      id: "item-2",
      productKey: "premiumContent",
      quantity: 3,
      unitPrice: 500,
      totalAmount: 1500,
      currency: "EUR",
      name: "Premium content access",
      description: "Premium access",
    },
  ],
};

function applicationConfig(transactionSurfacesEnabled: boolean) {
  return { billing: { transactionSurfacesEnabled } } as ApplicationConfig;
}

let currentCart: TransactionCartContextValue | undefined;

function CartHarness() {
  const cart = useTransactionCart();
  useEffect(() => {
    currentCart = cart;
  }, [cart]);
  return null;
}

function tree(
  queryClient: QueryClient,
  userId: string | null,
  child: ReactNode = createElement(CartHarness),
  initialApplicationConfig?: ApplicationConfig,
) {
  return createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(TransactionCartProvider, {
      userId,
      initialApplicationConfig: initialApplicationConfig
        ?? queryClient.getQueryData<ApplicationConfig>(queryKeys.me.applicationConfig)
        ?? applicationConfig(false),
    }, child),
  );
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
}

async function waitForCondition(predicate: () => boolean, timeoutMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for provider state");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}

describe("transaction cart provider", () => {
  it("enables only for an authenticated user in transaction mode", () => {
    expect(isTransactionCartEnabled(applicationConfig(true), "user-1", "user-1", false)).toBe(true);
    expect(isTransactionCartEnabled(applicationConfig(false), "user-1", "user-1", false)).toBe(false);
    expect(isTransactionCartEnabled(applicationConfig(true), null, "user-1", false)).toBe(false);
    expect(isTransactionCartEnabled(applicationConfig(true), "user-1", null, false)).toBe(false);
    expect(isTransactionCartEnabled(applicationConfig(true), "user-1", "user-2", false)).toBe(false);
    expect(isTransactionCartEnabled(applicationConfig(true), "user-1", "user-1", true)).toBe(false);
    expect(isTransactionCartEnabled(undefined, "user-1", "user-1", false)).toBe(false);
  });

  it("uses an empty basket fallback and sums item quantities", () => {
    expect(EMPTY_TRANSACTION_BASKET).toEqual({ id: "", status: "draft", currency: null, totalAmount: 0, items: [] });
    expect(getTransactionBasketTotalQuantity(EMPTY_TRANSACTION_BASKET)).toBe(0);
    expect(getTransactionBasketTotalQuantity(basket)).toBe(5);
  });

  it("preserves dirty catalog edits while adopting untouched refetched quantities", () => {
    const edited = transactionQuantityReducer(createTransactionQuantityState(basket), {
      type: "quantityChanged",
      productKey: "starterContent",
      quantity: 9,
    });
    const refetched = {
      ...basket,
      items: [
        { ...basket.items[0], quantity: 4 },
        { ...basket.items[1], quantity: 6 },
      ],
    };
    const synced = transactionQuantityReducer(edited, {
      type: "basketSynced",
      basket: refetched,
      preserveEdits: true,
    });

    expect(synced.quantities).toEqual({ starterContent: 9, premiumContent: 6 });
    expect(synced.dirtyProductKeys).toEqual(new Set(["starterContent"]));
    expect(transactionQuantityReducer(synced, { type: "mutationFailed" }).quantities).toEqual({ starterContent: 4, premiumContent: 6 });
  });

  it("accepts first seeds only while cache exactly matches its initial snapshot", () => {
    const firstSeed = { ...basket, totalAmount: 3000 };
    const initialSnapshot = { contentKey: JSON.stringify(basket), dataUpdatedAt: 100 };

    expect(shouldSeedTransactionBasket({
      initialBasket: firstSeed,
      dirty: false,
      initialSnapshot: { contentKey: null, dataUpdatedAt: 0 },
    })).toBe(true);
    expect(shouldSeedTransactionBasket({
      initialBasket: firstSeed,
      dirty: false,
      initialSnapshot,
      currentBasket: basket,
      currentDataUpdatedAt: 100,
    })).toBe(true);
    expect(shouldSeedTransactionBasket({
      initialBasket: firstSeed,
      dirty: false,
      initialSnapshot: { contentKey: null, dataUpdatedAt: 0 },
      currentBasket: EMPTY_TRANSACTION_BASKET,
      currentDataUpdatedAt: 100,
    })).toBe(false);
    expect(shouldSeedTransactionBasket({
      initialBasket: firstSeed,
      dirty: false,
      initialSnapshot,
      currentBasket: { ...basket, totalAmount: 9000 },
      currentDataUpdatedAt: 100,
    })).toBe(false);
    expect(shouldSeedTransactionBasket({
      initialBasket: firstSeed,
      dirty: false,
      initialSnapshot,
      currentBasket: basket,
      currentDataUpdatedAt: 101,
    })).toBe(false);
  });

  it("accepts later seeds only while cache remains the exact previous seed", () => {
    const firstSeed = { ...basket, totalAmount: 3000 };
    const laterSeed = { ...basket, totalAmount: 3500 };
    const previousSeed = { inputKey: JSON.stringify(firstSeed), dataUpdatedAt: 120 };

    expect(shouldSeedTransactionBasket({
      initialBasket: firstSeed,
      dirty: false,
      initialSnapshot: { contentKey: null, dataUpdatedAt: 0 },
      currentBasket: firstSeed,
      currentDataUpdatedAt: 120,
      previousSeed,
    })).toBe(false);
    expect(shouldSeedTransactionBasket({
      initialBasket: laterSeed,
      dirty: false,
      initialSnapshot: { contentKey: null, dataUpdatedAt: 0 },
      currentBasket: firstSeed,
      currentDataUpdatedAt: 120,
      previousSeed,
    })).toBe(true);
    expect(shouldSeedTransactionBasket({
      initialBasket: laterSeed,
      dirty: false,
      initialSnapshot: { contentKey: null, dataUpdatedAt: 0 },
      currentBasket: { ...firstSeed, totalAmount: 9000 },
      currentDataUpdatedAt: 121,
      previousSeed,
    })).toBe(false);
    expect(shouldSeedTransactionBasket({
      initialBasket: laterSeed,
      dirty: true,
      initialSnapshot: { contentKey: null, dataUpdatedAt: 0 },
      currentBasket: firstSeed,
      currentDataUpdatedAt: 120,
      previousSeed,
    })).toBe(false);
  });

  it("uses the user-scoped basket key and requires mounted server/live/captured identity", () => {
    expect(getTransactionBasketQueryKey("user-1")).toEqual(queryKeys.transactions.basket("user-1"));
    expect(getTransactionBasketQueryKey("user-1")).not.toEqual(getTransactionBasketQueryKey("user-2"));
    expect(isTransactionCartLifecycleCurrent({ mounted: true, providerUserId: "user-1", liveUserId: "user-1", capturedUserId: "user-1" })).toBe(true);
    expect(isTransactionCartLifecycleCurrent({ mounted: true, providerUserId: "user-1", liveUserId: "user-2", capturedUserId: "user-1" })).toBe(false);
    expect(isTransactionCartLifecycleCurrent({ mounted: false, providerUserId: "user-1", liveUserId: "user-1", capturedUserId: "user-1" })).toBe(false);
  });

  it.each([
    { operation: "upsert" as const, userId: "user-1", productKey: "starterContent", quantity: 4 },
    { operation: "remove" as const, userId: "user-1", productKey: "starterContent" },
    { operation: "clear" as const, userId: "user-1" },
  ])("applies current $operation success and error callbacks", (input) => {
    const updateBasket = vi.fn();
    const basketError = vi.fn();
    const callbacks = createTransactionCartMutationCallbacks({
      isCurrent: () => true,
      updateBasket,
      basketError,
      checkoutSuccess: vi.fn(),
      checkoutError: vi.fn(),
    });

    callbacks.basketSuccess({ success: true, data: basket }, input);
    callbacks.basketError(new Error("failed"), input);

    expect(updateBasket).toHaveBeenCalledWith(basket, "productKey" in input ? input.productKey : undefined);
    expect(basketError).toHaveBeenCalledOnce();
  });

  it.each([
    { name: "stale live user", mounted: true, providerUserId: "user-1", liveUserId: "user-2" },
    { name: "unmounted provider", mounted: false, providerUserId: "user-1", liveUserId: "user-1" },
  ])("ignores all basket and checkout callbacks for a $name", ({ mounted, providerUserId, liveUserId }) => {
    const effects = {
      updateBasket: vi.fn(),
      basketError: vi.fn(),
      checkoutSuccess: vi.fn(),
      checkoutError: vi.fn(),
    };
    const callbacks = createTransactionCartMutationCallbacks({
      isCurrent: (capturedUserId) => isTransactionCartLifecycleCurrent({ mounted, providerUserId, liveUserId, capturedUserId }),
      ...effects,
    });
    const checkout = { checkoutUrl: "https://checkout.example/order-1", orderId: "order-1" };

    for (const input of [
      { operation: "upsert" as const, userId: "user-1", productKey: "starterContent", quantity: 4 },
      { operation: "remove" as const, userId: "user-1", productKey: "starterContent" },
      { operation: "clear" as const, userId: "user-1" },
    ]) {
      callbacks.basketSuccess({ success: true, data: basket }, input);
      callbacks.basketError(new Error("failed"), input);
    }
    callbacks.checkoutSuccess(checkout, { userId: "user-1" });
    callbacks.checkoutError(new Error("failed"), { userId: "user-1" });

    expect(effects.updateBasket).not.toHaveBeenCalled();
    expect(effects.basketError).not.toHaveBeenCalled();
    expect(effects.checkoutSuccess).not.toHaveBeenCalled();
    expect(effects.checkoutError).not.toHaveBeenCalled();
  });

  it("applies current checkout success and error callbacks", () => {
    const checkoutSuccess = vi.fn();
    const checkoutError = vi.fn();
    const callbacks = createTransactionCartMutationCallbacks({
      isCurrent: () => true,
      updateBasket: vi.fn(),
      basketError: vi.fn(),
      checkoutSuccess,
      checkoutError,
    });
    const checkout = { checkoutUrl: "https://checkout.example/order-1", orderId: "order-1" };

    callbacks.checkoutSuccess(checkout, { userId: "user-1" });
    callbacks.checkoutError(new Error("failed"), { userId: "user-1" });

    expect(checkoutSuccess).toHaveBeenCalledWith(checkout);
    expect(checkoutError).toHaveBeenCalledOnce();
  });

  it("reuses cached application config and exposes safe loading state", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.me.applicationConfig, applicationConfig(true));
    apiMocks.getMyTransactionBasket.mockImplementation(() => new Promise(() => undefined));

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(tree(queryClient, "user-1"));
    });

    expect(apiMocks.getMyApplicationConfig).not.toHaveBeenCalled();
    expect(apiMocks.getMyTransactionBasket).toHaveBeenCalledOnce();
    expect(currentCart?.enabled).toBe(true);
    expect(currentCart?.basket).toEqual(EMPTY_TRANSACTION_BASKET);
    expect(currentCart?.quantities).toEqual({});
    expect(currentCart?.totalQuantity).toBe(0);
    expect(currentCart?.basketHasData).toBe(false);
    expect(currentCart?.basketFetching).toBe(true);
    expect(currentCart?.basketError).toBe(false);
    act(() => renderer.unmount());
  });

  it("stays enabled from server config when the client config refetch fails", async () => {
    const queryClient = createQueryClient();
    const initialApplicationConfig = applicationConfig(true);
    apiMocks.getMyApplicationConfig.mockRejectedValue(new Error("client config unavailable"));
    queryClient.setQueryData(queryKeys.transactions.basket("user-1"), basket);

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(tree(queryClient, "user-1", createElement(CartHarness), initialApplicationConfig));
    });
    expect(currentCart?.enabled).toBe(true);

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.me.applicationConfig });
    });

    expect(apiMocks.getMyApplicationConfig).toHaveBeenCalledOnce();
    expect(currentCart?.enabled).toBe(true);
    expect(currentCart?.basket).toEqual(basket);
    expect(queryClient.getQueryData(queryKeys.me.applicationConfig)).toEqual(initialApplicationConfig);
    act(() => renderer.unmount());
  });

  it("prefers fresh server config over stale mount cache before the nav seed effect", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.me.applicationConfig, applicationConfig(false));
    queryClient.setQueryData(queryKeys.transactions.basket("user-1"), basket);

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(tree(queryClient, "user-1", createElement(CartHarness), applicationConfig(true)));
    });

    expect(currentCart?.enabled).toBe(true);
    act(() => renderer.unmount());
  });

  it("degrades without crashing when server config is absent and the client config fails", async () => {
    const queryClient = createQueryClient();
    apiMocks.getMyApplicationConfig.mockRejectedValue(new Error("client config unavailable"));

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(tree(queryClient, "user-1", createElement(CartHarness), undefined));
    });

    expect(currentCart?.enabled).toBe(false);
    expect(currentCart?.basket).toEqual(EMPTY_TRANSACTION_BASKET);
    act(() => renderer.unmount());
  });

  it("distinguishes a successful empty basket from the initial fallback", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.me.applicationConfig, applicationConfig(true));
    queryClient.setQueryData(queryKeys.transactions.basket("user-1"), EMPTY_TRANSACTION_BASKET);

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(tree(queryClient, "user-1"));
    });

    expect(currentCart?.basket).toEqual(EMPTY_TRANSACTION_BASKET);
    expect(currentCart?.basketHasData).toBe(true);
    expect(currentCart?.basketFetching).toBe(false);
    act(() => renderer.unmount());
  });

  it("exposes an initial basket failure without claiming fallback data", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.me.applicationConfig, applicationConfig(true));
    apiMocks.getMyTransactionBasket.mockRejectedValue(new Error("network unavailable"));

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(tree(queryClient, "user-1"));
    });
    await waitForCondition(() => currentCart?.basketError === true);

    expect(currentCart?.basketHasData).toBe(false);
    expect(currentCart?.basketError).toBe(true);
    expect(currentCart?.basketFetching).toBe(false);
    act(() => renderer.unmount());
  });

  it("does not fetch a basket when transaction mode is disabled", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.me.applicationConfig, applicationConfig(false));

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(tree(queryClient, "user-1"));
    });

    expect(currentCart?.enabled).toBe(false);
    expect(currentCart?.basket).toEqual(EMPTY_TRANSACTION_BASKET);
    expect(currentCart?.basketHasData).toBe(false);
    expect(apiMocks.getMyTransactionBasket).not.toHaveBeenCalled();

    act(() => {
      currentCart?.changeCatalogQuantity("starterContent", 7);
      currentCart?.upsert("starterContent", 7);
      currentCart?.change("starterContent", 7);
      currentCart?.remove("starterContent");
      currentCart?.clear();
      currentCart?.checkout();
    });
    expect(currentCart?.quantities).toEqual({});
    expect(apiMocks.upsertMyTransactionBasketItem).not.toHaveBeenCalled();
    expect(apiMocks.removeMyTransactionBasketItem).not.toHaveBeenCalled();
    expect(apiMocks.clearMyTransactionBasket).not.toHaveBeenCalled();
    expect(apiMocks.createMyTransactionCheckout).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });

  it("keeps sheet state explicit and does not auto-open for edits or upserts", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.me.applicationConfig, applicationConfig(true));
    queryClient.setQueryData(queryKeys.transactions.basket("user-1"), basket);
    apiMocks.upsertMyTransactionBasketItem.mockResolvedValue({ success: true, data: basket });

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(tree(queryClient, "user-1"));
    });
    expect(currentCart?.open).toBe(false);

    act(() => currentCart?.changeCatalogQuantity("starterContent", 7));
    expect(currentCart?.quantities.starterContent).toBe(7);
    expect(currentCart?.open).toBe(false);

    await act(async () => {
      currentCart?.upsert("starterContent", 7);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(currentCart?.open).toBe(false);

    act(() => currentCart?.setOpen(true));
    expect(currentCart?.open).toBe(true);
    act(() => renderer.unmount());
  });

  it("closes on disable and stays closed after re-enable until controlled open changes", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.me.applicationConfig, applicationConfig(true));
    queryClient.setQueryData(queryKeys.transactions.basket("user-1"), basket);

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(tree(queryClient, "user-1"));
    });
    act(() => currentCart?.setOpen(true));
    expect(currentCart?.open).toBe(true);

    await act(async () => {
      authMocks.session = { data: { user: { id: "other-user" } }, isPending: false };
      renderer.update(tree(queryClient, "user-1"));
    });
    expect(currentCart?.enabled).toBe(false);
    expect(currentCart?.open).toBe(false);

    await act(async () => {
      authMocks.session = { data: { user: { id: "user-1" } }, isPending: false };
      renderer.update(tree(queryClient, "user-1"));
    });
    expect(currentCart?.enabled).toBe(true);
    expect(currentCart?.open).toBe(false);

    act(() => currentCart?.setOpen(true));
    expect(currentCart?.open).toBe(true);
    act(() => currentCart?.setOpen(false));
    expect(currentCart?.open).toBe(false);
    act(() => renderer.unmount());
  });

  it("keeps context callbacks stable across sheet state changes", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.me.applicationConfig, applicationConfig(true));
    queryClient.setQueryData(queryKeys.transactions.basket("user-1"), basket);

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(tree(queryClient, "user-1"));
    });
    const initialCart = currentCart;
    const initialCallbacks = {
      refetchBasket: initialCart?.refetchBasket,
      retryBasket: initialCart?.retryBasket,
      changeCatalogQuantity: initialCart?.changeCatalogQuantity,
      upsert: initialCart?.upsert,
      change: initialCart?.change,
      remove: initialCart?.remove,
      clear: initialCart?.clear,
      checkout: initialCart?.checkout,
      seedBasket: initialCart?.seedBasket,
    };

    act(() => currentCart?.setOpen(true));

    expect(currentCart).not.toBe(initialCart);
    for (const [name, callback] of Object.entries(initialCallbacks)) {
      expect(currentCart?.[name as keyof typeof initialCallbacks], name).toBe(callback);
    }
    act(() => renderer.unmount());
  });

  it("seeds the portal basket when transaction config becomes enabled and does not overwrite newer cache", async () => {
    const queryClient = createQueryClient();
    const setQueryData = vi.spyOn(queryClient, "setQueryData");
    let resolveConfig!: (config: ApplicationConfig) => void;
    apiMocks.getMyApplicationConfig.mockImplementation(() => new Promise((resolve) => {
      resolveConfig = resolve;
    }));
    apiMocks.getMyTransactionBasket.mockImplementation(() => new Promise(() => undefined));
    const portal = createElement(TransactionBillingPortal, {
      userId: "user-1",
      initialBasket: basket,
      initialOrders: [],
      initialEntitlements: [],
    });

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(tree(queryClient, "user-1", portal, applicationConfig(false)));
    });
    expect(queryClient.getQueryData(queryKeys.transactions.basket("user-1"))).toBeUndefined();
    expect(renderer.root.findByType(TransactionProductCatalog).props.pending).toBe(true);

    act(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me.applicationConfig });
    });
    await waitForCondition(() => typeof resolveConfig === "function");
    await act(async () => {
      resolveConfig(applicationConfig(false));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(queryClient.getQueryData(queryKeys.transactions.basket("user-1"))).toBeUndefined();
    expect(renderer.root.findByType(TransactionProductCatalog).props.pending).toBe(true);

    await act(async () => {
      queryClient.setQueryData(queryKeys.me.applicationConfig, applicationConfig(true));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(queryClient.getQueryData(queryKeys.transactions.basket("user-1"))).toEqual(basket);
    expect(setQueryData.mock.calls.filter(([queryKey, value]) => (
      JSON.stringify(queryKey) === JSON.stringify(queryKeys.transactions.basket("user-1")) && value === basket
    ))).toHaveLength(1);
    expect(renderer.root.findByType(TransactionProductCatalog).props.pending).toBe(false);

    await act(async () => {
      authMocks.session = { data: { user: { id: "other-user" } }, isPending: false };
      renderer.update(tree(queryClient, "user-1", portal));
    });
    expect(renderer.root.findByType(TransactionProductCatalog).props.pending).toBe(true);
    await act(async () => {
      authMocks.session = { data: { user: { id: "user-1" } }, isPending: false };
      renderer.update(tree(queryClient, "user-1", portal));
    });

    const newerBasket = { ...basket, totalAmount: 9000 };
    await act(async () => {
      queryClient.setQueryData(queryKeys.transactions.basket("user-1"), newerBasket);
      queryClient.setQueryData(queryKeys.me.applicationConfig, applicationConfig(false));
      await new Promise((resolve) => setTimeout(resolve, 0));
      queryClient.setQueryData(queryKeys.me.applicationConfig, applicationConfig(true));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(queryClient.getQueryData(queryKeys.transactions.basket("user-1"))).toEqual(newerBasket);
    act(() => renderer.unmount());
  });

  it("seeds idempotently without replacing newer cache or dirty edits", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.me.applicationConfig, applicationConfig(true));
    apiMocks.getMyTransactionBasket.mockImplementation(() => new Promise(() => undefined));

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(tree(queryClient, "user-1"));
    });
    act(() => currentCart?.seedBasket(basket));
    expect(queryClient.getQueryData(queryKeys.transactions.basket("user-1"))).toEqual(basket);

    const newerBasket = { ...basket, totalAmount: 9000 };
    act(() => {
      queryClient.setQueryData(queryKeys.transactions.basket("user-1"), newerBasket);
    });
    act(() => currentCart?.seedBasket({ ...basket, totalAmount: 3000 }));
    expect(queryClient.getQueryData(queryKeys.transactions.basket("user-1"))).toEqual(newerBasket);

    act(() => currentCart?.changeCatalogQuantity("starterContent", 8));
    act(() => currentCart?.seedBasket({ ...basket, totalAmount: 3500 }));
    expect(queryClient.getQueryData(queryKeys.transactions.basket("user-1"))).toEqual(newerBasket);
    act(() => renderer.unmount());
  });

  it("keeps a successful upsert authoritative until its invalidation refetch completes", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.me.applicationConfig, applicationConfig(true));
    queryClient.setQueryData(queryKeys.transactions.basket("user-1"), basket);
    const authoritativeBasket = {
      ...basket,
      totalAmount: 3500,
      items: [{ ...basket.items[0], quantity: 4 }, basket.items[1]],
    };
    const refetchedBasket = {
      ...basket,
      totalAmount: 4000,
      items: [{ ...basket.items[0], quantity: 5 }, basket.items[1]],
    };
    let resolveRefetch!: (value: TransactionBasket) => void;
    apiMocks.upsertMyTransactionBasketItem.mockResolvedValue({ success: true, data: authoritativeBasket });
    apiMocks.getMyTransactionBasket.mockImplementation(() => new Promise((resolve) => {
      resolveRefetch = resolve;
    }));

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(tree(queryClient, "user-1"));
    });
    act(() => currentCart?.upsert("starterContent", 4));
    await waitForCondition(() => (
      currentCart?.mutationPending === false
      && currentCart.basketFetching === true
      && currentCart.quantities.starterContent === 4
      && typeof resolveRefetch === "function"
    ));

    expect(currentCart?.quantities).toEqual({ starterContent: 4, premiumContent: 3 });
    expect(currentCart?.mutationPending).toBe(false);
    expect(currentCart?.basketFetching).toBe(true);

    act(() => {
      resolveRefetch(refetchedBasket);
    });
    await waitForCondition(() => (
      currentCart?.basketFetching === false
      && currentCart.quantities.starterContent === 5
    ));
    expect(currentCart?.quantities).toEqual({ starterContent: 5, premiumContent: 3 });
    expect(currentCart?.basketFetching).toBe(false);
    act(() => renderer.unmount());
  });

  it("rolls a failed dirty upsert back to the latest refetched basket", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.me.applicationConfig, applicationConfig(true));
    queryClient.setQueryData(queryKeys.transactions.basket("user-1"), basket);
    const refetchedBasket = {
      ...basket,
      items: [{ ...basket.items[0], quantity: 6 }, basket.items[1]],
    };
    let rejectUpsert!: (error: Error) => void;
    apiMocks.upsertMyTransactionBasketItem.mockImplementation(() => new Promise((_, reject) => {
      rejectUpsert = reject;
    }));

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(tree(queryClient, "user-1"));
    });
    act(() => currentCart?.changeCatalogQuantity("starterContent", 4));
    act(() => currentCart?.upsert("starterContent", 4));
    act(() => {
      queryClient.setQueryData(queryKeys.transactions.basket("user-1"), refetchedBasket);
    });
    await waitForCondition(() => (
      currentCart?.basket.items[0]?.quantity === 6
      && currentCart.quantities.starterContent === 4
    ));
    expect(currentCart?.quantities.starterContent).toBe(4);

    act(() => {
      rejectUpsert(new Error("Basket update failed"));
    });
    await waitForCondition(() => (
      currentCart?.mutationPending === false
      && currentCart.quantities.starterContent === 6
      && toastMocks.error.mock.calls.length === 1
    ));
    expect(currentCart?.quantities.starterContent).toBe(6);
    expect(toastMocks.error).toHaveBeenCalledWith("errors.basketMutation");
    act(() => renderer.unmount());
  });

  it("adopts a changed server seed while its first matching seed remains the cache baseline", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.me.applicationConfig, applicationConfig(true));
    queryClient.setQueryData(queryKeys.transactions.basket("user-1"), basket);
    const changedServerBasket = { ...basket, totalAmount: 3000 };

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(tree(queryClient, "user-1"));
    });
    act(() => currentCart?.seedBasket(basket));
    act(() => currentCart?.seedBasket(changedServerBasket));

    expect(queryClient.getQueryData(queryKeys.transactions.basket("user-1"))).toEqual(changedServerBasket);
    act(() => renderer.unmount());
  });

  it("resets local quantities and sheet state when the user changes while preserving scoped caches", async () => {
    const userTwoBasket = { ...basket, id: "basket-2", items: [{ ...basket.items[0], quantity: 4 }] };
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.me.applicationConfig, applicationConfig(true));
    queryClient.setQueryData(queryKeys.transactions.basket("user-1"), basket);
    queryClient.setQueryData(queryKeys.transactions.basket("user-2"), userTwoBasket);

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(tree(queryClient, "user-1"));
    });
    act(() => {
      currentCart?.changeCatalogQuantity("starterContent", 8);
      currentCart?.setOpen(true);
    });
    expect(currentCart?.quantities.starterContent).toBe(8);
    expect(currentCart?.open).toBe(true);

    await act(async () => {
      authMocks.session = { data: { user: { id: "user-2" } }, isPending: false };
      renderer.update(tree(queryClient, "user-2"));
    });
    expect(currentCart?.basket).toEqual(userTwoBasket);
    expect(currentCart?.quantities).toEqual({ starterContent: 4 });
    expect(currentCart?.open).toBe(false);
    expect(queryClient.getQueryData(queryKeys.transactions.basket("user-1"))).toEqual(basket);
    act(() => renderer.unmount());
  });

  it("ignores an in-flight basket success after live sign-out", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.me.applicationConfig, applicationConfig(true));
    queryClient.setQueryData(queryKeys.transactions.basket("user-1"), basket);
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    let resolveUpsert!: (result: { success: true; data: TransactionBasket }) => void;
    apiMocks.upsertMyTransactionBasketItem.mockImplementation(() => new Promise((resolve) => {
      resolveUpsert = resolve;
    }));
    const mutationBasket = { ...basket, totalAmount: 7000 };

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(tree(queryClient, "user-1"));
    });
    act(() => currentCart?.upsert("starterContent", 7));
    await act(async () => {
      authMocks.session = { data: null, isPending: false };
      renderer.update(tree(queryClient, "user-1"));
    });
    await act(async () => {
      resolveUpsert({ success: true, data: mutationBasket });
      await Promise.resolve();
    });

    expect(currentCart?.enabled).toBe(false);
    expect(queryClient.getQueryData(queryKeys.transactions.basket("user-1"))).toEqual(basket);
    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(toastMocks.error).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });

  it("ignores an in-flight basket error after unmount", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.me.applicationConfig, applicationConfig(true));
    queryClient.setQueryData(queryKeys.transactions.basket("user-1"), basket);
    let rejectRemove!: (error: Error) => void;
    apiMocks.removeMyTransactionBasketItem.mockImplementation(() => new Promise((_, reject) => {
      rejectRemove = reject;
    }));

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(tree(queryClient, "user-1"));
    });
    act(() => currentCart?.changeCatalogQuantity("starterContent", 8));
    await act(async () => {
      currentCart?.remove("starterContent");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() => renderer.unmount());
    await act(async () => {
      rejectRemove(new Error("failed"));
      await Promise.resolve();
    });

    expect(queryClient.getQueryData(queryKeys.transactions.basket("user-1"))).toEqual(basket);
    expect(toastMocks.error).not.toHaveBeenCalled();
  });

  it("ignores checkout success and error after live sign-out", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.me.applicationConfig, applicationConfig(true));
    queryClient.setQueryData(queryKeys.transactions.basket("user-1"), basket);
    const assign = vi.fn();
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { assign } } });
    let resolveCheckout!: (result: { success: true; data: { checkoutUrl: string; orderId: string } }) => void;
    apiMocks.createMyTransactionCheckout.mockImplementation(() => new Promise((resolve) => {
      resolveCheckout = resolve;
    }));

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(tree(queryClient, "user-1"));
    });
    act(() => currentCart?.checkout());
    await act(async () => {
      authMocks.session = { data: null, isPending: false };
      renderer.update(tree(queryClient, "user-1"));
    });
    await act(async () => {
      resolveCheckout({ success: true, data: { checkoutUrl: "https://checkout.example/stale", orderId: "stale" } });
      await Promise.resolve();
    });

    expect(assign).not.toHaveBeenCalled();
    expect(toastMocks.error).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });

  it("redirects the current user's checkout under React Strict Mode", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.me.applicationConfig, applicationConfig(true));
    queryClient.setQueryData(queryKeys.transactions.basket("user-1"), basket);
    const assign = vi.fn();
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { assign } } });
    apiMocks.createMyTransactionCheckout.mockResolvedValue({
      success: true,
      data: { checkoutUrl: "https://checkout.example/current", orderId: "current" },
    });

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(createElement(StrictMode, null, tree(queryClient, "user-1")));
    });
    act(() => currentCart?.checkout());
    await waitForCondition(() => assign.mock.calls.length === 1);

    expect(assign).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith("https://checkout.example/current");
    act(() => renderer.unmount());
  });
});
