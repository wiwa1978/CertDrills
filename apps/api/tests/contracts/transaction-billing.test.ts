import { describe, expect, it } from "vitest";

import {
  transactionBasketItemRequestSchema,
  transactionEntitlementConsumeParamsSchema,
  transactionProductKeyParamsSchema,
  transactionOrderParamsSchema,
  transactionBasketResponseSchema,
  transactionOrderResponseSchema,
  transactionOrdersResponseSchema,
  transactionEntitlementsResponseSchema,
  transactionCheckoutResponseSchema,
} from "@platform/contracts/wire";

describe("transaction billing wire contracts", () => {
  it("validates basket item mutations", () => {
    expect(transactionBasketItemRequestSchema.parse({ productKey: "starterContent", quantity: 2 })).toEqual({
      productKey: "starterContent",
      quantity: 2,
    });
    expect(() => transactionBasketItemRequestSchema.parse({ productKey: "", quantity: 1 })).toThrow();
    expect(() => transactionBasketItemRequestSchema.parse({ productKey: "starterContent", quantity: 0 })).toThrow();
  });

  it("validates entitlement consume params", () => {
    expect(transactionEntitlementConsumeParamsSchema.parse({ entitlementId: "00000000-0000-4000-8000-000000000001" })).toEqual({
      entitlementId: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("validates transaction route params", () => {
    expect(transactionProductKeyParamsSchema.parse({ productKey: " starterContent " })).toEqual({
      productKey: "starterContent",
    });
    expect(transactionOrderParamsSchema.parse({ orderId: "order-1" })).toEqual({
      orderId: "order-1",
    });
    expect(() => transactionProductKeyParamsSchema.parse({ productKey: "" })).toThrow();
    expect(() => transactionOrderParamsSchema.parse({ orderId: "" })).toThrow();
  });

  it("validates transaction response payloads", () => {
    const basket = {
      id: "basket-1",
      status: "draft",
      currency: "EUR",
      totalAmount: 1000,
      items: [{ id: "item-1", productKey: "starterContent", quantity: 2, unitPrice: 500, totalAmount: 1000, currency: "EUR", name: "Starter content access" }],
    };
    expect(transactionBasketResponseSchema.parse({ success: true, data: basket }).data.totalAmount).toBe(1000);

    const order = {
      id: "order-1",
      status: "paid",
      currency: "EUR",
      subtotalAmount: 1000,
      taxAmount: 0,
      totalAmount: 1000,
      paymentId: "pay_1",
      createdAt: "2026-08-03T00:00:00.000Z",
      items: [{ id: "order-item-1", productKey: "starterContent", quantity: 2, unitPrice: 500, totalAmount: 1000, currency: "EUR", name: "Starter content access" }],
    };
    expect(transactionOrderResponseSchema.parse({ success: true, data: order }).data.status).toBe("paid");
    expect(transactionOrdersResponseSchema.parse({ success: true, data: [order] }).data).toHaveLength(1);

    expect(transactionEntitlementsResponseSchema.parse({
      success: true,
      data: [{ id: "00000000-0000-4000-8000-000000000001", productKey: "starterContent", status: "available", orderId: "order-1", createdAt: "2026-08-03T00:00:00.000Z" }],
    }).data[0]?.status).toBe("available");
    expect(() => transactionEntitlementsResponseSchema.parse({
      success: true,
      data: [{ id: "ent-1", productKey: "starterContent", status: "available", orderId: "order-1", createdAt: "2026-08-03T00:00:00.000Z" }],
    })).toThrow();

    expect(transactionCheckoutResponseSchema.parse({
      success: true,
      data: { checkoutUrl: "https://checkout.test/order-1", orderId: "order-1" },
    }).data.checkoutUrl).toBe("https://checkout.test/order-1");
  });
});
