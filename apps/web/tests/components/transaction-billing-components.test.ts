import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TransactionEntitlement, TransactionOrder } from "@platform/contracts";

const messages: Record<string, string> = {
  "catalog.title": "Products",
  "catalog.description": "Choose access products and quantities. Prices exclude tax.",
  "catalog.preTax": "Pre-tax price",
  "catalog.addOrUpdate": "Add or update",
  "catalog.quantityLabel": "{product} quantity: {quantity}",
  "catalog.decreaseQuantity": "Decrease {product} quantity",
  "catalog.increaseQuantity": "Increase {product} quantity",
  "orders.title": "Recent orders",
  "orders.description": "Payment history and provider-calculated totals.",
  "orders.order": "Order {id}",
  "orders.status": "Order status: {status}",
  "orders.date": "Date: {date}",
  "orders.payment": "Payment: {id}",
  "orders.quantity": "Quantity: {quantity}",
  "orders.subtotal": "Subtotal",
  "orders.tax": "Tax",
  "orders.total": "Total",
  "orders.statuses.paid": "Paid",
  "entitlements.title": "Entitlements",
  "entitlements.description": "Access granted by completed orders.",
  "entitlements.status": "Entitlement status: {status}",
  "entitlements.order": "Order: {id}",
  "entitlements.created": "Created: {date}",
  "entitlements.statuses.available": "Available",
  "products.starterContent.name": "Starter content access",
  "products.starterContent.description": "One durable entitlement for the starter content product.",
  "products.premiumContent.name": "Premium content access",
  "products.premiumContent.description": "One durable entitlement for the premium content product.",
};

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    let message = messages[key] ?? key;
    for (const [name, value] of Object.entries(values ?? {})) message = message.replace(`{${name}}`, String(value));
    return message;
  },
}));

import { TransactionEntitlements } from "../../src/components/layout/backend/billing/transaction-entitlements";
import { TransactionOrders } from "../../src/components/layout/backend/billing/transaction-orders";
import { TransactionProductCatalog } from "../../src/components/layout/backend/billing/transaction-product-catalog";
import { transactionProducts } from "../../src/config/billing";

type ElementProps = Record<string, unknown> & { children?: ReactNode };

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

const item = {
  id: "item-1",
  productKey: "starterContent",
  quantity: 2,
  unitPrice: 500,
  totalAmount: 1000,
  currency: "EUR",
  name: "Starter content access",
  description: "Starter access",
};

describe("transaction billing rendering components", () => {
  it("renders full-width catalog cards with accessible bounded quantity controls and pre-tax money", () => {
    const onQuantityChange = vi.fn();
    const tree = TransactionProductCatalog({
      products: transactionProducts,
      quantities: { starterContent: 100 },
      pending: false,
      onQuantityChange,
      onSubmit: vi.fn(),
    });
    const html = renderToStaticMarkup(tree);
    const maximumIncrease = findElement(tree, (element) => element.props["aria-label"] === "Increase Starter content access quantity");

    expect(html).toContain("grid gap-4 sm:grid-cols-2");
    expect(html).toContain("Starter content access");
    expect(html).toContain("Premium content access");
    expect(html).toContain("€5.00");
    expect(html).toContain("€10.00");
    expect(html).toContain("Pre-tax price");
    expect(html).toContain('<span class="sr-only">Starter content access quantity: 100</span>');
    expect(maximumIncrease.props.disabled).toBe(true);
    (maximumIncrease.props.onClick as () => void)();
    expect(onQuantityChange).toHaveBeenCalledWith("starterContent", 100);
  });

  it("disables catalog quantity and submit controls while pending", () => {
    const tree = TransactionProductCatalog({
      products: [transactionProducts[0]],
      quantities: { starterContent: 1 },
      pending: true,
      onQuantityChange: vi.fn(),
      onSubmit: vi.fn(),
    });

    expect(findElement(tree, (element) => element.props["aria-label"] === "Decrease Starter content access quantity").props.disabled).toBe(true);
    expect(findElement(tree, (element) => element.props.children === "Add or update").props.disabled).toBe(true);
  });

  it("renders order totals, accessible status, and historical API names", () => {
    const historicalItem = { ...item, id: "legacy-item", productKey: "retiredContent", name: "Legacy content access", providerProductId: "legacy-provider" };
    const orders: TransactionOrder[] = [{
      id: "order-1",
      status: "paid",
      currency: "EUR",
      subtotalAmount: 1000,
      taxAmount: 210,
      totalAmount: 1210,
      paymentId: "pay-1",
      createdAt: "2026-08-03T10:00:00.000Z",
      items: [historicalItem],
    }];
    const html = renderToStaticMarkup(createElement(TransactionOrders, { orders }));

    expect(html).toContain("Legacy content access");
    expect(html).not.toContain("retiredContent");
    expect(html).toContain("€10.00");
    expect(html).toContain("€2.10");
    expect(html).toContain("€12.10");
    expect(html).toContain('aria-label="Order status: Paid"');
  });

  it("renders read-only entitlement semantics and accessible status", () => {
    const entitlements: TransactionEntitlement[] = [{
      id: "00000000-0000-4000-8000-000000000001",
      productKey: "starterContent",
      status: "available",
      orderId: "order-1",
      createdAt: "2026-08-03T10:00:00.000Z",
      consumedAt: null,
      refundedAt: null,
    }];
    const html = renderToStaticMarkup(createElement(TransactionEntitlements, { entitlements }));

    expect(html).toContain("Starter content access");
    expect(html).toContain('aria-label="Entitlement status: Available"');
    expect(html).toContain("Order: order-1");
    expect(html).not.toContain("Consume");
  });
});
