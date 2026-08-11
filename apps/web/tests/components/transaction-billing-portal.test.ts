import { createElement } from "react";
import { readFileSync } from "node:fs";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionBasket, TransactionEntitlement, TransactionOrder } from "@platform/contracts";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cartMocks = vi.hoisted(() => ({
  cart: {
    providerUserId: "user-1" as string | null,
    enabled: true,
    quantities: { starterContent: 2 } as Record<string, number>,
    basketHasData: true,
    basketFetching: false,
    basketError: false,
    mutationPending: false,
    checkoutPending: false,
    changeCatalogQuantity: vi.fn(),
    upsert: vi.fn(),
    seedBasket: vi.fn(),
    setOpen: vi.fn(),
  },
}));

vi.mock("@/components/providers/transaction-cart-provider", () => ({
  useTransactionCart: () => cartMocks.cart,
}));
vi.mock("@/lib/api/me", () => ({
  clearMyTransactionBasket: vi.fn(),
  createMyTransactionCheckout: vi.fn(),
  getMyTransactionBasket: vi.fn(),
  removeMyTransactionBasketItem: vi.fn(),
  upsertMyTransactionBasketItem: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => ({
    eyebrow: "Transaction billing",
    title: "Purchase access",
    description: "Select products and continue to secure checkout.",
    loading: "Refreshing transaction billing...",
    "errors.basketQuery": "We couldn't refresh your basket. Showing the last successful basket.",
  })[key] ?? key,
}));

import { TransactionBillingPortal } from "../../src/components/layout/backend/billing/transaction-billing-portal";
import { TransactionEntitlements } from "../../src/components/layout/backend/billing/transaction-entitlements";
import { TransactionOrders } from "../../src/components/layout/backend/billing/transaction-orders";
import { TransactionProductCatalog } from "../../src/components/layout/backend/billing/transaction-product-catalog";

const originalConsoleError = console.error;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(cartMocks.cart, {
    providerUserId: "user-1",
    enabled: true,
    quantities: { starterContent: 2 },
    basketHasData: true,
    basketFetching: false,
    basketError: false,
    mutationPending: false,
    checkoutPending: false,
  });
  consoleError = vi.spyOn(console, "error").mockImplementation((message, ...args) => {
    if (message === "react-test-renderer is deprecated. See https://react.dev/warnings/react-test-renderer") return;
    originalConsoleError(message, ...args);
  });
});

afterEach(() => consoleError.mockRestore());

const basket: TransactionBasket = {
  id: "basket-1",
  status: "draft",
  currency: "EUR",
  totalAmount: 1000,
  items: [{
    id: "item-1",
    productKey: "starterContent",
    quantity: 2,
    unitPrice: 500,
    totalAmount: 1000,
    currency: "EUR",
    name: "Starter content access",
    description: "Starter access",
  }],
};

const orders: TransactionOrder[] = [{
  id: "order-1",
  status: "paid",
  currency: "EUR",
  subtotalAmount: 1000,
  taxAmount: 210,
  totalAmount: 1210,
  paymentId: "pay-1",
  createdAt: "2026-08-03T10:00:00.000Z",
  items: [{ ...basket.items[0], providerProductId: "provider-1" }],
}];

const entitlements: TransactionEntitlement[] = [{
  id: "00000000-0000-4000-8000-000000000001",
  productKey: "starterContent",
  status: "available",
  orderId: "order-1",
  createdAt: "2026-08-03T10:00:00.000Z",
  consumedAt: null,
  refundedAt: null,
}];

function portal(initialBasket = basket, userId = "user-1") {
  return createElement(TransactionBillingPortal, {
    userId,
    initialBasket,
    initialOrders: orders,
    initialEntitlements: entitlements,
  });
}

function classNames(root: ReactTestInstance) {
  return root.findAll((instance) => typeof instance.props.className === "string")
    .map((instance) => instance.props.className as string);
}

function isTestInstance(child: string | ReactTestInstance): child is ReactTestInstance {
  return typeof child !== "string";
}

async function renderPortal(element = portal()) {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(element);
  });
  return renderer;
}

describe("transaction billing portal", () => {
  it("renders a full-width catalog without a permanent or sticky basket", async () => {
    const renderer = await renderPortal();
    const layout = renderer.root.find((instance) => instance.type === "div" && instance.props.className === "space-y-10");
    const directComponentTypes = layout.children
      .filter(isTestInstance)
      .map((child) => child.type);

    expect(renderer.root.findAllByType(TransactionProductCatalog)).toHaveLength(1);
    expect(classNames(renderer.root).join(" ")).not.toContain("lg:grid-cols-[minmax(0,1fr)_22rem]");
    expect(classNames(renderer.root).join(" ")).not.toContain("lg:sticky");
    expect(directComponentTypes).toContain(TransactionProductCatalog);
    const catalog = renderer.root.findByType(TransactionProductCatalog);
    expect(catalog.parent).toBe(layout);
    expect(catalog.findByType("section").props.className).toBe("space-y-4");
    expect(catalog.find((instance) => instance.type === "div" && instance.props.className === "grid gap-4 sm:grid-cols-2")).toBeDefined();

    act(() => renderer.unmount());
  });

  it("does not retain the legacy permanent basket wrapper", () => {
    const basketSource = readFileSync(new URL("../../src/components/layout/backend/billing/transaction-basket.tsx", import.meta.url), "utf8");

    expect(basketSource).not.toContain("TransactionBasketView");
    expect(basketSource).not.toContain("<aside");
    expect(basketSource).not.toContain("lg:sticky lg:top-24");
  });

  it("seeds the provider from an effect when the initial basket changes", async () => {
    const renderer = await renderPortal();
    expect(cartMocks.cart.seedBasket).toHaveBeenCalledOnce();
    expect(cartMocks.cart.seedBasket).toHaveBeenLastCalledWith(basket);

    const changedBasket = { ...basket, totalAmount: 1500 };
    await act(async () => {
      renderer.update(portal(changedBasket));
    });
    expect(cartMocks.cart.seedBasket).toHaveBeenCalledTimes(2);
    expect(cartMocks.cart.seedBasket).toHaveBeenLastCalledWith(changedBasket);

    act(() => renderer.unmount());
  });

  it("maps provider quantities and callbacks to the catalog without opening the sheet", async () => {
    const renderer = await renderPortal();
    const catalog = renderer.root.findByType(TransactionProductCatalog);

    expect(catalog.props.quantities).toBe(cartMocks.cart.quantities);
    expect(catalog.props.pending).toBe(false);
    act(() => catalog.props.onQuantityChange("starterContent", 3));
    act(() => catalog.props.onSubmit("starterContent", 3));

    expect(cartMocks.cart.changeCatalogQuantity).toHaveBeenCalledWith("starterContent", 3);
    expect(cartMocks.cart.upsert).toHaveBeenCalledWith("starterContent", 3);
    expect(cartMocks.cart.setOpen).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });

  it.each([
    { mutationPending: true, checkoutPending: false },
    { mutationPending: false, checkoutPending: true },
  ])("disables the catalog for provider pending state %#", async ({ mutationPending, checkoutPending }) => {
    Object.assign(cartMocks.cart, { mutationPending, checkoutPending });
    const renderer = await renderPortal();

    expect(renderer.root.findByType(TransactionProductCatalog).props.pending).toBe(true);
    act(() => renderer.unmount());
  });

  it("disables the catalog while the provider is not enabled", async () => {
    cartMocks.cart.enabled = false;
    const renderer = await renderPortal();
    const catalog = renderer.root.findByType(TransactionProductCatalog);

    expect(catalog.props.pending).toBe(true);
    act(() => catalog.props.onQuantityChange("starterContent", 3));
    act(() => catalog.props.onSubmit("starterContent", 3));
    expect(cartMocks.cart.changeCatalogQuantity).not.toHaveBeenCalled();
    expect(cartMocks.cart.upsert).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });

  it("announces provider basket fetching without narrowing the catalog", async () => {
    cartMocks.cart.basketFetching = true;
    const renderer = await renderPortal();
    const status = renderer.root.find((instance) => instance.props.role === "status");

    expect(status.props.className).toContain("sr-only");
    expect(status.props.children).toBe("Refreshing transaction billing...");
    expect(renderer.root.findByType(TransactionProductCatalog)).toBeDefined();
    act(() => renderer.unmount());
  });

  it("shows a page alert only when a failed refresh has last successful basket data", async () => {
    Object.assign(cartMocks.cart, { basketError: true, basketHasData: true });
    const renderer = await renderPortal();
    expect(renderer.root.findByProps({ role: "alert" })).toBeDefined();
    expect(renderer.root.findByProps({ "data-slot": "alert-description" }).props.children).toContain("last successful basket");
    act(() => renderer.unmount());

    cartMocks.cart.basketHasData = false;
    const initialFailureRenderer = await renderPortal();
    expect(initialFailureRenderer.root.findAllByProps({ role: "alert" })).toHaveLength(0);
    act(() => initialFailureRenderer.unmount());
  });

  it("keeps orders and entitlements below the catalog", async () => {
    const renderer = await renderPortal();
    const layout = renderer.root.find((instance) => instance.type === "div" && instance.props.className === "space-y-10");
    const directComponentTypes = layout.children
      .filter(isTestInstance)
      .map((child) => child.type);

    expect(renderer.root.findByType(TransactionOrders).props.orders).toBe(orders);
    expect(renderer.root.findByType(TransactionEntitlements).props.entitlements).toBe(entitlements);
    expect(directComponentTypes.indexOf(TransactionProductCatalog)).toBeLessThan(directComponentTypes.indexOf(TransactionOrders));
    expect(directComponentTypes.indexOf(TransactionOrders)).toBeLessThan(directComponentTypes.indexOf(TransactionEntitlements));
    act(() => renderer.unmount());
  });

  it("fails safely when the portal user does not match the provider user", async () => {
    Object.assign(cartMocks.cart, {
      providerUserId: "other-user",
      quantities: { starterContent: 99 },
    });
    const renderer = await renderPortal();
    const catalog = renderer.root.findByType(TransactionProductCatalog);

    expect(cartMocks.cart.seedBasket).not.toHaveBeenCalled();
    expect(catalog.props.quantities).toEqual({});
    expect(catalog.props.pending).toBe(true);
    act(() => catalog.props.onQuantityChange("starterContent", 3));
    act(() => catalog.props.onSubmit("starterContent", 3));
    expect(cartMocks.cart.changeCatalogQuantity).not.toHaveBeenCalled();
    expect(cartMocks.cart.upsert).not.toHaveBeenCalled();
    expect(cartMocks.cart.setOpen).not.toHaveBeenCalled();

    act(() => renderer.unmount());
  });
});
