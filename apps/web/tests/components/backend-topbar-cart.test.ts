import { Children, createElement, isValidElement, type ComponentType, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionBasket } from "@platform/contracts";

const authMocks = vi.hoisted(() => ({
  session: { data: { user: { id: "user-1" } }, isPending: false } as {
    data: { user: { id: string } } | null;
    isPending: boolean;
  },
}));
const cartMocks = vi.hoisted(() => ({
  cart: {
    enabled: true,
    basket: {
      id: "basket-1",
      status: "draft" as TransactionBasket["status"],
      currency: "EUR" as string | null,
      totalAmount: 1000,
      items: [] as TransactionBasket["items"],
    },
    totalQuantity: 0,
    basketHasData: true,
    basketFetching: false,
    basketError: false,
    mutationPending: false,
    checkoutPending: false,
    open: false,
    setOpen: vi.fn(),
    retryBasket: vi.fn(),
    change: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    checkout: vi.fn(),
  },
}));

const messages: Record<string, string> = {
  "basket.title": "Cart",
  "basket.description": "Review your cart and continue to checkout.",
  "basket.triggerLabel": "Open cart",
  "basket.triggerLabelWithCount": "Open cart, {count} items",
  "basket.close": "Close cart",
  "basket.loading": "Loading your cart...",
  "basket.clear": "Clear",
  "basket.empty": "Your cart is empty.",
  "basket.remove": "Remove {product}",
  "basket.quantityLabel": "{product} quantity: {quantity}",
  "basket.decreaseQuantity": "Decrease {product} quantity",
  "basket.increaseQuantity": "Increase {product} quantity",
  "basket.subtotal": "Subtotal",
  "basket.taxNote": "Tax is calculated at checkout.",
  "basket.checkout": "Checkout",
  "basket.checkoutPending": "Opening checkout...",
  "basket.retry": "Try again",
  loading: "Refreshing transaction billing...",
  "errors.basketQuery": "We couldn't refresh your cart. Showing the last available cart.",
  "errors.basketQueryInitial": "We couldn't load your cart.",
  "products.starterContent.name": "Starter content access",
};

vi.mock("../../src/lib/auth-client", () => ({ useSession: () => authMocks.session }));
vi.mock("../../src/components/providers/transaction-cart-provider", () => ({
  useTransactionCart: () => cartMocks.cart,
}));
vi.mock("../../src/components/layout/backend/shared/backend-topbar-breadcrumbs", () => ({ BackendTopbarBreadcrumbs: () => null }));
vi.mock("../../src/components/layout/backend/shared/backend-topbar-search", () => ({ BackendTopbarSearch: () => null }));
vi.mock("../../src/components/layout/backend/shared/backend-topbar-appswitcher", () => ({ BackendTopbarAppSwitcher: () => null }));
vi.mock("../../src/components/layout/backend/shared/backend-topbar-notifications", () => ({ BackendTopbarNotifications: () => null }));
vi.mock("../../src/components/layout/backend/shared/backend-topbar-organizationswitcher", () => ({ BackendTopbarOrganizationSwitcher: () => null }));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    let message = messages[key] ?? key;
    for (const [name, value] of Object.entries(values ?? {})) message = message.replace(`{${name}}`, String(value));
    return message;
  },
}));

import { TransactionBasketContent } from "../../src/components/layout/backend/billing/transaction-basket";
import { BackendTopbarCart, BackendTopbarCartView } from "../../src/components/layout/backend/shared/backend-topbar-cart";
import { BackendTopbar } from "../../src/components/layout/backend/shared/backend-topbar";
import { BackendTopbarNotifications } from "../../src/components/layout/backend/shared/backend-topbar-notifications";
import { Button } from "../../src/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "../../src/components/ui/sheet";

type ElementProps = Record<string, unknown> & { children?: ReactNode };

const translate = (key: string, values?: Record<string, string | number>) => {
  let message = messages[key] ?? key;
  for (const [name, value] of Object.entries(values ?? {})) message = message.replace(`{${name}}`, String(value));
  return message;
};

function cartTree() {
  return BackendTopbarCartView({ cart: cartMocks.cart as never, hasLiveUser: Boolean(authMocks.session.data?.user), headingId: "cart-heading", t: translate as never });
}

function findElement(node: ReactNode, predicate: (element: ReactElement<ElementProps>) => boolean): ReactElement<ElementProps> {
  if (!isValidElement<ElementProps>(node)) throw new Error("Expected a React element");
  if (predicate(node)) return node;
  for (const child of Children.toArray(node.props.children)) {
    if (!isValidElement(child)) continue;
    try {
      return findElement(child, predicate);
    } catch {
      // Continue through sibling branches.
    }
  }
  throw new Error("Element not found");
}

const populatedBasket: TransactionBasket = {
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

describe("backend topbar cart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.session = { data: { user: { id: "user-1" } }, isPending: false };
    Object.assign(cartMocks.cart, {
      enabled: true,
      basket: { ...populatedBasket, currency: null, totalAmount: 0, items: [] },
      totalQuantity: 0,
      basketHasData: true,
      basketFetching: false,
      basketError: false,
      mutationPending: false,
      checkoutPending: false,
      open: false,
    });
  });

  it("is invisible when transaction mode is disabled or the live user is absent", () => {
    cartMocks.cart.enabled = false;
    expect(cartTree()).toBeNull();

    cartMocks.cart.enabled = true;
    authMocks.session = { data: null, isPending: false };
    expect(cartTree()).toBeNull();
  });

  it("renders a compact empty trigger without a badge", () => {
    const tree = cartTree();
    const trigger = findElement(tree, (element) => element.type === Button);

    expect(trigger.props.size).toBe("icon");
    expect(trigger.props["aria-label"]).toBe("Open cart");
    expect(renderToStaticMarkup(tree)).not.toContain("99+");
    expect(renderToStaticMarkup(tree)).not.toContain("data-cart-badge");
  });

  it("shows the summed quantity with an accessible true-count label", () => {
    cartMocks.cart.totalQuantity = 125;
    const tree = cartTree();
    const trigger = findElement(tree, (element) => element.type === Button);
    const html = renderToStaticMarkup(tree);

    expect(trigger.props["aria-label"]).toBe("Open cart, 125 items");
    expect(html).toContain("99+");
    expect(html).toContain("pointer-events-none");
  });

  it("uses provider-controlled state and delegates opening to a single Radix trigger child", () => {
    cartMocks.cart.open = true;
    const tree = cartTree();
    const sheet = findElement(tree, (element) => element.type === Sheet);
    const sheetTrigger = findElement(tree, (element) => element.type === SheetTrigger);
    const trigger = findElement(tree, (element) => element.type === Button);
    const content = findElement(tree, (element) => element.type === SheetContent);

    expect(sheet.props.open).toBe(true);
    expect(sheet.props.onOpenChange).toBe(cartMocks.cart.setOpen);
    expect(sheetTrigger.props.asChild).toBe(true);
    expect(Children.count(sheetTrigger.props.children)).toBe(1);
    expect(isValidElement(sheetTrigger.props.children) && sheetTrigger.props.children.type).toBe(Button);
    expect(trigger.props.onClick).toBeUndefined();
    expect(trigger.props["aria-controls"]).toBeUndefined();
    expect(trigger.props["aria-expanded"]).toBeUndefined();
    expect(content.props.side).toBe("right");
    expect(content.props.className).toContain("w-full");
    expect(content.props.className).toContain("sm:max-w-md");
    expect(content.props.closeLabel).toBe("Close cart");
    const title = findElement(tree, (element) => element.type === SheetTitle);
    expect(title.props.children).toBe("Cart");
    expect(title.props.id).toBeUndefined();
    expect(findElement(tree, (element) => element.type === SheetDescription).props.children).toBe("Review your cart and continue to checkout.");
    const basketContent = findElement(tree, (element) => element.type === TransactionBasketContent);
    expect(basketContent.props.headingId).toBe("cart-heading");
    expect(basketContent.props.headingId).not.toBe(title.props.id);

    const basketHtml = renderToStaticMarkup(createElement(TransactionBasketContent, basketContent.props as never));
    expect(basketHtml).toContain('<section class="flex min-h-0 flex-1 flex-col" aria-labelledby="cart-heading">');
    expect(basketHtml).toContain('<h3 id="cart-heading" class="sr-only">Cart</h3>');
  });

  it("passes the localized close label through SheetContent to the primitive label", () => {
    const tree = SheetContent({ closeLabel: "Close cart", children: null });
    const label = findElement(tree, (element) => element.type === "span" && element.props.className === "sr-only");
    const defaultTree = SheetContent({ children: null });
    const defaultLabel = findElement(defaultTree, (element) => element.type === "span" && element.props.className === "sr-only");

    expect(label.props.children).toBe("Close cart");
    expect(defaultLabel.props.children).toBe("Close");
  });

  it("keeps basket items scrollable and the summary footer anchored", () => {
    const html = renderToStaticMarkup(createElement(TransactionBasketContent, {
      basket: populatedBasket,
      pending: false,
      checkoutPending: false,
      headingId: "basket-heading",
      onQuantityChange: vi.fn(),
      onRemove: vi.fn(),
      onClear: vi.fn(),
      onCheckout: vi.fn(),
    }));

    expect(html).toContain("flex min-h-0 flex-1 flex-col");
    expect(html).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(html).toContain("mt-auto shrink-0");
    expect(html).not.toContain("lg:sticky");
    expect(html).not.toContain('data-slot="card"');
  });

  it("names each basket region with a connected unique heading", () => {
    const html = renderToStaticMarkup(createElement("div", null,
      createElement(TransactionBasketContent, {
        basket: populatedBasket,
        pending: false,
        checkoutPending: false,
        headingId: "first-cart-heading",
        onQuantityChange: vi.fn(),
        onRemove: vi.fn(),
        onClear: vi.fn(),
        onCheckout: vi.fn(),
      }),
      createElement(TransactionBasketContent, {
        basket: populatedBasket,
        pending: false,
        checkoutPending: false,
        headingId: "second-cart-heading",
        onQuantityChange: vi.fn(),
        onRemove: vi.fn(),
        onClear: vi.fn(),
        onCheckout: vi.fn(),
      }),
    ));
    const headingIds = [...html.matchAll(/<h3[^>]*id="([^"]+)"/g)].map((match) => match[1]);
    const labelledBy = [...html.matchAll(/<section[^>]*aria-labelledby="([^"]+)"/g)].map((match) => match[1]);

    expect(headingIds).toHaveLength(2);
    expect(new Set(headingIds).size).toBe(2);
    expect(labelledBy).toEqual(headingIds);
    expect(html).not.toContain('id="transaction-basket-heading"');
  });

  it("shows initial loading without an empty state", () => {
    Object.assign(cartMocks.cart, { basketHasData: false, basketFetching: true, basketError: false });
    const basketContent = findElement(cartTree(), (element) => element.type === TransactionBasketContent);
    const html = renderToStaticMarkup(createElement(TransactionBasketContent, basketContent.props as never));

    expect(html).toContain("Loading your cart...");
    expect(html).not.toContain("Your cart is empty.");
  });

  it("shows an initial error and retry without empty basket content", () => {
    Object.assign(cartMocks.cart, { basketHasData: false, basketFetching: false, basketError: true });
    const basketContent = findElement(cartTree(), (element) => element.type === TransactionBasketContent);
    const html = renderToStaticMarkup(createElement(TransactionBasketContent, basketContent.props as never));

    expect(html).toContain("We couldn&#x27;t load your cart.");
    expect(html).not.toContain("Showing the last available cart");
    expect(html).toContain("Try again");
    expect(html).not.toContain("Your cart is empty.");
    expect(html).not.toContain("Subtotal");
  });

  it("retains basket controls, bounds, and pending disabled semantics", () => {
    const onQuantityChange = vi.fn();
    const tree = TransactionBasketContent({
      basket: { ...populatedBasket, items: [{ ...populatedBasket.items[0], quantity: 100 }] },
      pending: false,
      checkoutPending: false,
      headingId: "maximum-basket-heading",
      onQuantityChange,
      onRemove: vi.fn(),
      onClear: vi.fn(),
      onCheckout: vi.fn(),
    });
    const increase = findElement(tree, (element) => element.props["aria-label"] === "Increase Starter content access quantity");
    expect(increase.props.disabled).toBe(true);
    (increase.props.onClick as () => void)();
    expect(onQuantityChange).toHaveBeenCalledWith("starterContent", 100);

    const pendingTree = TransactionBasketContent({
      basket: populatedBasket,
      pending: true,
      checkoutPending: false,
      headingId: "pending-basket-heading",
      onQuantityChange,
      onRemove: vi.fn(),
      onClear: vi.fn(),
      onCheckout: vi.fn(),
    });
    expect(findElement(pendingTree, (element) => element.props["aria-label"] === "Remove Starter content access").props.disabled).toBe(true);
    expect(findElement(pendingTree, (element) => element.props.children === "Checkout").props.disabled).toBe(true);
  });

  it("renders query retry feedback while preserving the last basket", () => {
    cartMocks.cart.basket = populatedBasket;
    cartMocks.cart.totalQuantity = 2;
    cartMocks.cart.basketHasData = true;
    cartMocks.cart.basketFetching = true;
    cartMocks.cart.basketError = true;
    const tree = cartTree();
    const basketContent = findElement(tree, (element) => element.type === TransactionBasketContent);

    expect(basketContent.props.basket).toBe(populatedBasket);
    expect(basketContent.props.error).toBe(true);
    expect(basketContent.props.hasData).toBe(true);
    expect(basketContent.props.fetching).toBe(true);
    expect(basketContent.props.onRetry).toBe(cartMocks.cart.retryBasket);

    const html = renderToStaticMarkup(createElement(TransactionBasketContent, basketContent.props as never));
    expect(html).toContain("We couldn&#x27;t refresh your cart");
    expect(html).toContain("Try again");
    expect(html).toContain("Starter content access");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-busy="true"[^>]*>Try again<\/button>/);
  });

  it("places the cart before notifications in the topbar", () => {
    const tree = BackendTopbar();
    const rightSection = findElement(tree, (element) => (
      typeof element.props.className === "string"
      && element.props.className.includes("shrink-0")
      && Children.toArray(element.props.children).some((child) => isValidElement(child) && child.type === BackendTopbarCart)
    ));
    const childTypes = Children.toArray(rightSection.props.children)
      .filter(isValidElement)
      .map((child) => child.type as ComponentType);

    expect(childTypes.indexOf(BackendTopbarCart)).toBeLessThan(childTypes.indexOf(BackendTopbarNotifications));
    expect(rightSection.props.className).toContain("gap-1");
    expect(rightSection.props.className).toContain("sm:gap-3");
  });
});
