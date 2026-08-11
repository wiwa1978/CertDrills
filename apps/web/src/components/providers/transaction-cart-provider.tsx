"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApplicationConfig, SuccessResult, TransactionBasket, TransactionCheckout } from "@platform/contracts";
import { queryKeys } from "@platform/frontend-shared/query-keys";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { TRANSACTION_QUANTITY_MAX, TRANSACTION_QUANTITY_MIN } from "@/components/layout/backend/billing/transaction-product-catalog";
import {
  clearMyTransactionBasket,
  createMyTransactionCheckout,
  getMyApplicationConfig,
  getMyTransactionBasket,
  removeMyTransactionBasketItem,
  upsertMyTransactionBasketItem,
} from "@/lib/api/me";
import { webQueryKeys } from "@/lib/query/keys";
import { useSession } from "@/lib/auth-client";
import { createApplicationConfigSnapshot, matchesApplicationConfigSnapshot } from "./application-config-seed";

export const EMPTY_TRANSACTION_BASKET: TransactionBasket = {
  id: "",
  status: "draft",
  currency: null,
  totalAmount: 0,
  items: [],
};

type TransactionPortalApi = {
  upsert: (input: { productKey: string; quantity: number }) => Promise<SuccessResult<TransactionBasket>>;
  remove: (productKey: string) => Promise<SuccessResult<TransactionBasket>>;
  clear: () => Promise<SuccessResult<TransactionBasket>>;
  checkout: () => Promise<SuccessResult<TransactionCheckout>>;
};

export function createTransactionPortalActions(api: TransactionPortalApi) {
  return {
    upsert: (productKey: string, quantity: number) => api.upsert({ productKey, quantity }),
    remove: (productKey: string) => api.remove(productKey),
    clear: () => api.clear(),
    checkout: async (): Promise<TransactionCheckout> => {
      const result = await api.checkout();
      return result.data;
    },
  };
}

export type TransactionQuantityAction =
  | { type: "quantityChanged"; productKey: string; quantity: number }
  | { type: "basketUpdated"; basket: TransactionBasket; productKey?: string }
  | { type: "basketSynced"; basket: TransactionBasket; preserveEdits: boolean }
  | { type: "mutationFailed" };

export type TransactionQuantityState = {
  basket: TransactionBasket;
  quantities: Record<string, number>;
  dirtyProductKeys: Set<string>;
};

function quantitiesFromBasket(basket: TransactionBasket): Record<string, number> {
  return Object.fromEntries(basket.items.map((item) => [item.productKey, item.quantity]));
}

export function basketContentKey(basket: TransactionBasket) {
  return JSON.stringify(basket);
}

export function createTransactionQuantityState(basket: TransactionBasket): TransactionQuantityState {
  return { basket, quantities: quantitiesFromBasket(basket), dirtyProductKeys: new Set() };
}

export function transactionQuantityReducer(state: TransactionQuantityState, action: TransactionQuantityAction): TransactionQuantityState {
  if (action.type === "basketUpdated") {
    const nextState = createTransactionQuantityState(action.basket);
    if (!action.productKey) return nextState;
    nextState.dirtyProductKeys = new Set(state.dirtyProductKeys);
    nextState.dirtyProductKeys.delete(action.productKey);
    for (const productKey of nextState.dirtyProductKeys) {
      if (state.quantities[productKey] !== undefined) {
        nextState.quantities[productKey] = state.quantities[productKey];
      }
    }
    return nextState;
  }
  if (action.type === "basketSynced") {
    const basketQuantities = quantitiesFromBasket(action.basket);
    const quantities = Object.fromEntries(Object.entries(basketQuantities).map(([productKey, quantity]) => [
      productKey,
      action.preserveEdits && state.dirtyProductKeys.has(productKey) ? state.quantities[productKey] : quantity,
    ]));
    for (const productKey of state.dirtyProductKeys) {
      if (action.preserveEdits && state.quantities[productKey] !== undefined && quantities[productKey] === undefined) {
        quantities[productKey] = state.quantities[productKey];
      }
    }
    return {
      basket: action.basket,
      quantities,
      dirtyProductKeys: action.preserveEdits ? state.dirtyProductKeys : new Set(),
    };
  }
  if (action.type === "mutationFailed") {
    return { basket: state.basket, quantities: quantitiesFromBasket(state.basket), dirtyProductKeys: new Set() };
  }
  return {
    ...state,
    dirtyProductKeys: new Set(state.dirtyProductKeys).add(action.productKey),
    quantities: {
      ...state.quantities,
      [action.productKey]: Math.min(TRANSACTION_QUANTITY_MAX, Math.max(TRANSACTION_QUANTITY_MIN, action.quantity)),
    },
  };
}

export function isTransactionCartEnabled(
  applicationConfig: ApplicationConfig | undefined,
  providerUserId: string | null,
  liveUserId: string | null,
  sessionPending: boolean,
) {
  return Boolean(
    !sessionPending
    && providerUserId
    && liveUserId === providerUserId
    && applicationConfig?.billing.transactionSurfacesEnabled === true,
  );
}

export function getTransactionBasketQueryKey(userId: string) {
  return queryKeys.transactions.basket(userId);
}

export function getTransactionBasketTotalQuantity(basket: TransactionBasket) {
  return basket.items.reduce((total, item) => total + item.quantity, 0);
}

export function isTransactionCartLifecycleCurrent(input: {
  mounted: boolean;
  providerUserId: string | null;
  liveUserId: string | null;
  capturedUserId: string;
}) {
  return input.mounted
    && input.capturedUserId === input.providerUserId
    && input.capturedUserId === input.liveUserId;
}

type BasketSeed = {
  inputKey: string;
  dataUpdatedAt: number;
};

type BasketCacheSnapshot = {
  contentKey: string | null;
  dataUpdatedAt: number;
};

export function shouldSeedTransactionBasket(input: {
  initialBasket: TransactionBasket;
  dirty: boolean;
  initialSnapshot: BasketCacheSnapshot;
  currentBasket?: TransactionBasket;
  currentDataUpdatedAt?: number;
  previousSeed?: BasketSeed;
}) {
  if (input.dirty) return false;
  if (input.previousSeed) {
    if (input.previousSeed.inputKey === basketContentKey(input.initialBasket)) return false;
    return input.currentDataUpdatedAt === input.previousSeed.dataUpdatedAt
      && input.currentBasket !== undefined
      && basketContentKey(input.currentBasket) === input.previousSeed.inputKey;
  }
  if (input.initialSnapshot.contentKey === null) return input.currentBasket === undefined;
  return input.currentBasket !== undefined
    && basketContentKey(input.currentBasket) === input.initialSnapshot.contentKey
    && input.currentDataUpdatedAt === input.initialSnapshot.dataUpdatedAt;
}

type BasketMutationInput =
  | { operation: "upsert"; userId: string; productKey: string; quantity: number }
  | { operation: "remove"; userId: string; productKey: string }
  | { operation: "clear"; userId: string };

type CheckoutMutationInput = { userId: string };

export function createTransactionCartMutationCallbacks(input: {
  isCurrent: (capturedUserId: string) => boolean;
  updateBasket: (basket: TransactionBasket, productKey?: string) => void;
  basketError: () => void;
  checkoutSuccess: (checkout: TransactionCheckout) => void;
  checkoutError: () => void;
}) {
  return {
    basketSuccess: (result: SuccessResult<TransactionBasket>, mutation: BasketMutationInput) => {
      if (!input.isCurrent(mutation.userId)) return;
      input.updateBasket(result.data, mutation.operation === "clear" ? undefined : mutation.productKey);
    },
    basketError: (_error: unknown, mutation: BasketMutationInput) => {
      if (!input.isCurrent(mutation.userId)) return;
      input.basketError();
    },
    checkoutSuccess: (checkout: TransactionCheckout, mutation: CheckoutMutationInput) => {
      if (!input.isCurrent(mutation.userId)) return;
      input.checkoutSuccess(checkout);
    },
    checkoutError: (_error: unknown, mutation: CheckoutMutationInput) => {
      if (!input.isCurrent(mutation.userId)) return;
      input.checkoutError();
    },
  };
}

export type TransactionCartContextValue = {
  providerUserId: string | null;
  enabled: boolean;
  basket: TransactionBasket;
  quantities: Record<string, number>;
  totalQuantity: number;
  basketHasData: boolean;
  basketFetching: boolean;
  basketError: boolean;
  refetchBasket: () => void;
  retryBasket: () => void;
  mutationPending: boolean;
  checkoutPending: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  changeCatalogQuantity: (productKey: string, quantity: number) => void;
  upsert: (productKey: string, quantity: number) => void;
  change: (productKey: string, quantity: number) => void;
  remove: (productKey: string) => void;
  clear: () => void;
  checkout: () => void;
  seedBasket: (initialBasket: TransactionBasket) => void;
};

const TransactionCartContext = createContext<TransactionCartContextValue | undefined>(undefined);

export function TransactionCartProvider({ userId, initialApplicationConfig, children }: { userId: string | null; initialApplicationConfig?: ApplicationConfig; children?: ReactNode }) {
  return <TransactionCartProviderContent key={userId ?? "anonymous"} userId={userId} initialApplicationConfig={initialApplicationConfig}>{children}</TransactionCartProviderContent>;
}

function TransactionCartProviderContent({ userId, initialApplicationConfig, children }: { userId: string | null; initialApplicationConfig?: ApplicationConfig; children?: ReactNode }) {
  const t = useTranslations("billing.transaction");
  const { data: session, isPending: sessionPending } = useSession();
  const liveUserId = session?.user.id ?? null;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const mounted = useRef(false);
  const liveUserIdRef = useRef<string | null>(null);
  const dirtyProductKeys = useRef(new Set<string>());
  const previousSeed = useRef<BasketSeed | undefined>(undefined);
  const [initialApplicationConfigSnapshot] = useState(() => {
    const state = queryClient.getQueryState<ApplicationConfig>(webQueryKeys.applicationConfig);
    return createApplicationConfigSnapshot(state?.data, state?.dataUpdatedAt);
  });
  const applicationConfigQuery = useQuery({
    queryKey: webQueryKeys.applicationConfig,
    queryFn: getMyApplicationConfig,
    initialData: initialApplicationConfig,
    staleTime: 60_000,
  });
  const currentApplicationConfigState = queryClient.getQueryState<ApplicationConfig>(webQueryKeys.applicationConfig);
  const applicationConfig = initialApplicationConfig !== undefined && matchesApplicationConfigSnapshot(
    initialApplicationConfigSnapshot,
    currentApplicationConfigState?.data,
    currentApplicationConfigState?.dataUpdatedAt,
  ) ? initialApplicationConfig : applicationConfigQuery.data;
  const enabled = isTransactionCartEnabled(applicationConfig, userId, liveUserId, sessionPending);
  const basketQueryKey = useMemo(
    () => getTransactionBasketQueryKey(userId ?? "anonymous"),
    [userId],
  );
  const initialBasketSnapshot = useRef<BasketCacheSnapshot>((() => {
    const initialState = queryClient.getQueryState<TransactionBasket>(basketQueryKey);
    return {
      contentKey: initialState?.data ? basketContentKey(initialState.data) : null,
      dataUpdatedAt: initialState?.dataUpdatedAt ?? 0,
    };
  })());
  const basketQuery = useQuery({
    queryKey: basketQueryKey,
    queryFn: getMyTransactionBasket,
    enabled,
  });
  const refetchBasketQuery = basketQuery.refetch;
  const basket = enabled ? basketQuery.data ?? EMPTY_TRANSACTION_BASKET : EMPTY_TRANSACTION_BASKET;
  const [quantityState, dispatchQuantity] = useReducer(
    transactionQuantityReducer,
    basket,
    createTransactionQuantityState,
  );
  const actions = useMemo(() => createTransactionPortalActions({
    upsert: upsertMyTransactionBasketItem,
    remove: removeMyTransactionBasketItem,
    clear: clearMyTransactionBasket,
    checkout: createMyTransactionCheckout,
  }), []);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    liveUserIdRef.current = liveUserId;
  }, [liveUserId]);

  useEffect(() => {
    if (!enabled) queueMicrotask(() => setOpen(false));
  }, [enabled]);

  useEffect(() => {
    if (basketContentKey(quantityState.basket) !== basketContentKey(basket)) {
      dispatchQuantity({ type: "basketSynced", basket, preserveEdits: true });
    }
  }, [basket, quantityState.basket]);

  const updateBasket = useCallback((nextBasket: TransactionBasket, productKey?: string) => {
    if (productKey) dirtyProductKeys.current.delete(productKey);
    else dirtyProductKeys.current.clear();
    dispatchQuantity({ type: "basketUpdated", basket: nextBasket, productKey });
    queryClient.setQueryData(basketQueryKey, nextBasket);
    void queryClient.invalidateQueries({ queryKey: basketQueryKey });
  }, [basketQueryKey, queryClient]);
  const mutationError = useCallback(() => {
    dirtyProductKeys.current.clear();
    dispatchQuantity({ type: "mutationFailed" });
    toast.error(t("errors.basketMutation"));
  }, [t]);
  const getMutationCallbacks = useCallback(() => createTransactionCartMutationCallbacks({
      isCurrent: (capturedUserId) => isTransactionCartLifecycleCurrent({
        mounted: mounted.current,
        providerUserId: userId,
        liveUserId: liveUserIdRef.current,
        capturedUserId,
      }),
      updateBasket,
      basketError: mutationError,
      checkoutSuccess: (checkout) => window.location.assign(checkout.checkoutUrl),
      checkoutError: () => toast.error(t("errors.checkout")),
    }), [mutationError, t, updateBasket, userId]);
  const upsertMutation = useMutation({
    mutationFn: (input: Extract<BasketMutationInput, { operation: "upsert" }>) => actions.upsert(input.productKey, input.quantity),
    onSuccess: (result, input) => getMutationCallbacks().basketSuccess(result, input),
    onError: (error, input) => getMutationCallbacks().basketError(error, input),
  });
  const removeMutation = useMutation({
    mutationFn: (input: Extract<BasketMutationInput, { operation: "remove" }>) => actions.remove(input.productKey),
    onSuccess: (result, input) => getMutationCallbacks().basketSuccess(result, input),
    onError: (error, input) => getMutationCallbacks().basketError(error, input),
  });
  const clearMutation = useMutation({
    mutationFn: (_input: Extract<BasketMutationInput, { operation: "clear" }>) => actions.clear(),
    onSuccess: (result, input) => getMutationCallbacks().basketSuccess(result, input),
    onError: (error, input) => getMutationCallbacks().basketError(error, input),
  });
  const checkoutMutation = useMutation({
    mutationFn: (_input: CheckoutMutationInput) => actions.checkout(),
    onSuccess: (checkout, input) => getMutationCallbacks().checkoutSuccess(checkout, input),
    onError: (error, input) => getMutationCallbacks().checkoutError(error, input),
  });
  const upsertBasket = upsertMutation.mutate;
  const removeBasket = removeMutation.mutate;
  const clearBasket = clearMutation.mutate;
  const checkoutBasket = checkoutMutation.mutate;
  const mutationPending = upsertMutation.isPending || removeMutation.isPending || clearMutation.isPending;
  const refetchBasket = useCallback(() => {
    if (!enabled) return;
    void refetchBasketQuery();
  }, [enabled, refetchBasketQuery]);
  const upsert = useCallback((productKey: string, quantity: number) => {
    if (!enabled || !userId) return;
    upsertBasket({
      operation: "upsert",
      userId,
      productKey,
      quantity: Math.min(TRANSACTION_QUANTITY_MAX, Math.max(TRANSACTION_QUANTITY_MIN, quantity)),
    });
  }, [enabled, upsertBasket, userId]);
  const changeCatalogQuantity = useCallback((productKey: string, quantity: number) => {
    if (!enabled) return;
    dirtyProductKeys.current.add(productKey);
    dispatchQuantity({ type: "quantityChanged", productKey, quantity });
  }, [enabled]);
  const remove = useCallback((productKey: string) => {
    if (enabled && userId) removeBasket({ operation: "remove", userId, productKey });
  }, [enabled, removeBasket, userId]);
  const clear = useCallback(() => {
    if (enabled && userId) clearBasket({ operation: "clear", userId });
  }, [clearBasket, enabled, userId]);
  const checkout = useCallback(() => {
    if (enabled && userId) checkoutBasket({ userId });
  }, [checkoutBasket, enabled, userId]);
  const seedBasket = useCallback((initialBasket: TransactionBasket) => {
    if (!enabled || !userId) return;
    const queryState = queryClient.getQueryState<TransactionBasket>(basketQueryKey);
    if (!shouldSeedTransactionBasket({
      initialBasket,
      dirty: dirtyProductKeys.current.size > 0,
      initialSnapshot: initialBasketSnapshot.current,
      currentBasket: queryState?.data,
      currentDataUpdatedAt: queryState?.dataUpdatedAt,
      previousSeed: previousSeed.current,
    })) return;

    queryClient.setQueryData(basketQueryKey, initialBasket);
    const seededState = queryClient.getQueryState<TransactionBasket>(basketQueryKey);
    previousSeed.current = {
      inputKey: basketContentKey(initialBasket),
      dataUpdatedAt: seededState?.dataUpdatedAt ?? 0,
    };
  }, [basketQueryKey, enabled, queryClient, userId]);

  const context = useMemo<TransactionCartContextValue>(() => ({
    providerUserId: userId,
    enabled,
    basket,
    quantities: quantityState.quantities,
    totalQuantity: getTransactionBasketTotalQuantity(basket),
    basketHasData: enabled && basketQuery.data !== undefined,
    basketFetching: basketQuery.isFetching,
    basketError: basketQuery.isError || basketQuery.isRefetchError,
    refetchBasket,
    retryBasket: refetchBasket,
    mutationPending,
    checkoutPending: checkoutMutation.isPending,
    open,
    setOpen,
    changeCatalogQuantity,
    upsert,
    change: upsert,
    remove,
    clear,
    checkout,
    seedBasket,
  }), [
    basket,
    basketQuery.data,
    basketQuery.isError,
    basketQuery.isFetching,
    basketQuery.isRefetchError,
    changeCatalogQuantity,
    checkout,
    checkoutMutation.isPending,
    clear,
    enabled,
    mutationPending,
    open,
    quantityState.quantities,
    refetchBasket,
    remove,
    seedBasket,
    upsert,
    userId,
  ]);

  return <TransactionCartContext.Provider value={context}>{children}</TransactionCartContext.Provider>;
}

export function useTransactionCart() {
  const context = useContext(TransactionCartContext);
  if (!context) throw new Error("useTransactionCart must be used within a TransactionCartProvider");
  return context;
}
