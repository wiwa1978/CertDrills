import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";

import {
  transactionBasketItems,
  transactionBaskets,
  transactionEntitlements,
  transactionOrderItems,
  transactionOrders,
  type TransactionOrderStatus,
} from "@platform/platform-db";
import type { PlatformDb, PlatformDbTransaction } from "@platform/platform-db";
import { transactionProducts } from "../../config/billing";

import type { CreateCheckoutInput, PaymentProvider } from "../payments/provider";
import type { CheckoutIntentsService } from "./checkout-intents";

export type TransactionBasketLine = {
  productKey: string;
  quantity: number;
  unitPrice: number;
  currency: string;
};

type TransactionServiceDeps = {
  db: PlatformDb;
  paymentProvider: PaymentProvider;
  checkoutIntents: CheckoutIntentsService;
};

type OrderItemForEntitlement = {
  id: string;
  productKey: string;
  quantity: number;
  metadata?: unknown;
};

type TransactionOrderLine = TransactionBasketLine & {
  product: ReturnType<typeof productForKey>;
  providerProductId: string;
};
type TransactionBasketRecord = typeof transactionBaskets.$inferSelect;
type TransactionBasketItemRecord = typeof transactionBasketItems.$inferSelect;
type TransactionOrderRecord = typeof transactionOrders.$inferSelect;
type TransactionOrderItemRecord = typeof transactionOrderItems.$inferSelect;

type TransactionPaymentAmounts = {
  paymentId: string;
  currency: string;
  totalAmount: number;
  taxAmount: number;
};

const POSTGRES_INTEGER_MAX = 2_147_483_647;
const customerVisibleTransactionOrderStatuses = ["paid", "partially_refunded", "refunded"] as const satisfies readonly TransactionOrderStatus[];

export function isCustomerVisibleTransactionOrderStatus(status: TransactionOrderStatus) {
  return customerVisibleTransactionOrderStatuses.some((visibleStatus) => visibleStatus === status);
}

function customerVisibleTransactionOrderCondition() {
  return inArray(transactionOrders.status, customerVisibleTransactionOrderStatuses);
}

export function createTransactionOrderProductId(orderId: string) {
  return `transaction-order:${orderId}`;
}

export function calculateTransactionBasketTotals(lines: TransactionBasketLine[]) {
  if (lines.length === 0) {
    throw new Error("Transaction basket is empty");
  }

  const currency = lines[0]!.currency;
  if (lines.some((line) => line.currency !== currency)) {
    throw new Error("Transaction basket cannot contain mixed currencies");
  }

  const subtotalAmount = lines.reduce((total, line) => total + line.unitPrice * line.quantity, 0);
  return { currency, subtotalAmount, taxAmount: 0, totalAmount: subtotalAmount };
}

export function expandEntitlementUnits(input: { orderItemId: string; quantity: number }) {
  return Array.from({ length: input.quantity }, (_, unitIndex) => ({ orderItemId: input.orderItemId, unitIndex }));
}

export function validateProviderCartItems(input: {
  expected: Array<{ providerProductId: string; quantity: number }>;
  received?: Array<{ productId: string; quantity: number }>;
}) {
  const normalize = (items: Array<{ productId?: string; providerProductId?: string; quantity: number }>) => items
    .map((item) => ({ productId: item.productId ?? item.providerProductId!, quantity: Number(item.quantity) }))
    .sort((a, b) => a.productId.localeCompare(b.productId));

  if (JSON.stringify(normalize(input.expected)) !== JSON.stringify(normalize(input.received ?? []))) {
    throw new Error("provider cart line items mismatch");
  }
}

function validatePaymentReplay(order: TransactionOrderRecord, input: TransactionPaymentAmounts) {
  const subtotalAmount = input.totalAmount - input.taxAmount;
  if (
    order.currency !== input.currency ||
    Number(order.subtotalAmount) !== subtotalAmount ||
    Number(order.taxAmount) !== input.taxAmount ||
    Number(order.totalAmount) !== input.totalAmount
  ) {
    throw new Error(`Refusing payment ${input.paymentId}: payment replay amounts mismatch.`);
  }
}

function validateTransactionPaymentAmounts(input: TransactionPaymentAmounts) {
  if (!Number.isSafeInteger(input.totalAmount) || input.totalAmount < 0 || input.totalAmount > POSTGRES_INTEGER_MAX) {
    throw new Error(`Refusing payment ${input.paymentId}: invalid total amount.`);
  }
  if (!Number.isSafeInteger(input.taxAmount) || input.taxAmount < 0 || input.taxAmount > POSTGRES_INTEGER_MAX || input.taxAmount > input.totalAmount) {
    throw new Error(`Refusing payment ${input.paymentId}: invalid tax amount.`);
  }

  const subtotalAmount = input.totalAmount - input.taxAmount;
  if (!Number.isSafeInteger(subtotalAmount) || subtotalAmount < 0 || subtotalAmount > POSTGRES_INTEGER_MAX) {
    throw new Error(`Refusing payment ${input.paymentId}: invalid subtotal amount.`);
  }
  return subtotalAmount;
}

function compatiblePaymentIdentity(paymentId: string) {
  return or(isNull(transactionOrders.paymentId), eq(transactionOrders.paymentId, paymentId));
}

function productForKey(productKey: string) {
  const product = transactionProducts.find((item) => item.key === productKey);
  if (!product) throw new Error("Unknown transaction product");
  if (!product.active) throw new Error("Transaction product is inactive");
  return product;
}

function providerProductId(product: { key: string; providerProductIds: Record<string, string> }, providerName: string) {
  const productId = product.providerProductIds[providerName];
  if (!productId) throw new Error(`No provider product configured for ${providerName}:${product.key}`);
  return productId;
}

function serializeBasket(basket: TransactionBasketRecord, items: TransactionBasketItemRecord[]) {
  return {
    id: basket.id,
    status: basket.status,
    currency: basket.currency ?? null,
    totalAmount: items.reduce((total, item) => total + Number(item.unitPrice) * Number(item.quantity), 0),
    items: items.map((item) => {
      const product = productForKey(item.productKey);
      return {
        id: item.id,
        productKey: item.productKey,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        totalAmount: Number(item.unitPrice) * Number(item.quantity),
        currency: item.currency,
        name: product.name,
        description: product.description,
      };
    }),
  };
}

function metadataString(metadata: unknown, key: "name" | "description") {
  if (!metadata || typeof metadata !== "object") return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function serializeOrderItem(item: TransactionOrderItemRecord) {
  const product = transactionProducts.find((product) => product.key === item.productKey);
  return {
    id: item.id,
    productKey: item.productKey,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    totalAmount: Number(item.totalAmount),
    currency: item.currency,
    providerProductId: item.providerProductId ?? undefined,
    name: metadataString(item.metadata, "name") ?? product?.name ?? item.productKey,
    description: metadataString(item.metadata, "description") ?? product?.description,
  };
}

function serializeOrder(order: TransactionOrderRecord, items: TransactionOrderItemRecord[]) {
  return {
    id: order.id,
    status: order.status,
    currency: order.currency,
    subtotalAmount: Number(order.subtotalAmount),
    taxAmount: Number(order.taxAmount),
    totalAmount: Number(order.totalAmount),
    paymentId: order.paymentId ?? null,
    createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt,
    items: items.map(serializeOrderItem),
  };
}

export function createTransactionService(deps: TransactionServiceDeps) {
  async function getOrCreateDraftBasket(userId: string) {
    const existing = await deps.db.query.transactionBaskets.findFirst({
      where: and(eq(transactionBaskets.userId, userId), eq(transactionBaskets.status, "draft")),
    });
    if (existing) {
      const items = await deps.db.query.transactionBasketItems.findMany({ where: eq(transactionBasketItems.basketId, existing.id) });
      return serializeBasket(existing, items);
    }

    // "abandoned" is used as a short-lived checkout claim while the provider session is created.
    // Reusing it here prevents another draft basket from being created before failure restoration.
    const claimed = await deps.db.query.transactionBaskets.findFirst({
      where: and(eq(transactionBaskets.userId, userId), eq(transactionBaskets.status, "abandoned")),
      orderBy: desc(transactionBaskets.updatedAt),
    });
    if (claimed) {
      const items = await deps.db.query.transactionBasketItems.findMany({ where: eq(transactionBasketItems.basketId, claimed.id) });
      if (items.length > 0) return serializeBasket(claimed, items);
    }

    let basket;
    if (!basket) {
      [basket] = await deps.db
        .insert(transactionBaskets)
        .values({ userId, status: "draft" })
        .onConflictDoNothing()
        .returning();
    }
    basket ??= await deps.db.query.transactionBaskets.findFirst({
      where: and(eq(transactionBaskets.userId, userId), eq(transactionBaskets.status, "draft")),
    });
    if (!basket) {
      const racedClaim = await deps.db.query.transactionBaskets.findFirst({
        where: and(eq(transactionBaskets.userId, userId), eq(transactionBaskets.status, "abandoned")),
        orderBy: desc(transactionBaskets.updatedAt),
      });
      if (racedClaim) {
        const items = await deps.db.query.transactionBasketItems.findMany({ where: eq(transactionBasketItems.basketId, racedClaim.id) });
        if (items.length > 0) return serializeBasket(racedClaim, items);
      }
    }
    if (!basket) throw new Error("Transaction basket could not be created");
    const items = await deps.db.query.transactionBasketItems.findMany({ where: eq(transactionBasketItems.basketId, basket.id) });
    return serializeBasket(basket, items);
  }

  async function upsertBasketItem(userId: string, input: { productKey: string; quantity: number }) {
    const product = productForKey(input.productKey);
    const productId = providerProductId(product, deps.paymentProvider.name);
    const basket = await getOrCreateDraftBasket(userId);
    if (basket.status !== "draft") throw new Error("Transaction basket checkout is in progress");

    await deps.db.insert(transactionBasketItems).values({
      basketId: basket.id,
      productKey: product.key,
      quantity: input.quantity,
      unitPrice: product.price,
      currency: product.currency,
      metadata: { name: product.name, description: product.description, providerProductId: productId },
    }).onConflictDoUpdate({
      target: [transactionBasketItems.basketId, transactionBasketItems.productKey],
      set: {
        quantity: input.quantity,
        unitPrice: product.price,
        currency: product.currency,
        metadata: { name: product.name, description: product.description, providerProductId: productId },
        updatedAt: new Date(),
      },
    });

    return getOrCreateDraftBasket(userId);
  }

  async function removeBasketItem(userId: string, productKey: string) {
    const basket = await getOrCreateDraftBasket(userId);
    if (basket.status !== "draft") throw new Error("Transaction basket checkout is in progress");
    await deps.db.delete(transactionBasketItems).where(and(
      eq(transactionBasketItems.basketId, basket.id),
      eq(transactionBasketItems.productKey, productKey),
    ));
    return getOrCreateDraftBasket(userId);
  }

  async function clearBasket(userId: string) {
    const basket = await getOrCreateDraftBasket(userId);
    if (basket.status !== "draft") throw new Error("Transaction basket checkout is in progress");
    await deps.db.delete(transactionBasketItems).where(eq(transactionBasketItems.basketId, basket.id));
    return getOrCreateDraftBasket(userId);
  }

  async function checkoutBasket(input: {
    userId: string;
    customerEmail?: string | null;
    billingAddress?: CreateCheckoutInput["billingAddress"];
  }) {
    if (!deps.paymentProvider.createTransactionCheckoutUrl) {
      throw new Error("Transaction checkout is not configured for the active payment provider");
    }

    const checkoutData = await deps.db.transaction(async (tx) => { const basket = await tx.query.transactionBaskets.findFirst({
      where: and(eq(transactionBaskets.userId, input.userId), eq(transactionBaskets.status, "draft")),
    });
    if (!basket) throw new Error("Transaction basket is empty");
    
    const basketItems = await tx.query.transactionBasketItems.findMany({ where: eq(transactionBasketItems.basketId, basket.id) });
    if (basketItems.length === 0) throw new Error("Transaction basket is empty");
    
    const [claimedBasket] = await tx.update(transactionBaskets).set({ status: "abandoned", updatedAt: new Date() }).where(and(
      eq(transactionBaskets.id, basket.id),
      eq(transactionBaskets.status, "draft"),
    )).returning();
    if (!claimedBasket) throw new Error("Transaction basket is no longer draft");
    
      const orderLines: TransactionOrderLine[] = basketItems.map((item) => {
      const product = productForKey(item.productKey);
      return {
        product,
        productKey: product.key,
        quantity: Number(item.quantity),
        unitPrice: product.price,
        currency: product.currency,
        providerProductId: providerProductId(product, deps.paymentProvider.name),
      };
    });
    const totals = calculateTransactionBasketTotals(orderLines);
    
    const [order] = await tx.insert(transactionOrders).values({
      userId: input.userId,
      basketId: basket.id,
      status: "pending_payment",
      currency: totals.currency,
      subtotalAmount: totals.subtotalAmount,
      taxAmount: totals.taxAmount,
      totalAmount: totals.totalAmount,
      paymentProvider: deps.paymentProvider.name,
    }).returning();
    
    const insertedItems = await tx.insert(transactionOrderItems).values(orderLines.map((line) => ({
      orderId: order.id,
      productKey: line.productKey,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      totalAmount: line.unitPrice * line.quantity,
      currency: line.currency,
      providerProductId: line.providerProductId,
      fulfillmentType: "entitlement" as const,
      metadata: { name: line.product.name, description: line.product.description },
    }))).returning();
    
    const intent = await deps.checkoutIntents.create({
      userId: input.userId,
      billingMode: "transactions",
      productId: createTransactionOrderProductId(order.id),
      metadata: { orderId: order.id },
    }, tx);
    
    await tx.update(transactionOrders).set({ checkoutReferenceId: intent.referenceId, updatedAt: new Date() }).where(eq(transactionOrders.id, order.id));
    
    return { basketId: basket.id, orderId: order.id, intent, totals, orderItems: insertedItems }; });

    try {
      const checkoutUrl = await deps.paymentProvider.createTransactionCheckoutUrl({
        userId: input.userId,
        orderId: checkoutData.orderId,
        referenceId: checkoutData.intent.referenceId,
        currency: checkoutData.totals.currency,
        customerEmail: input.customerEmail,
        billingAddress: input.billingAddress ?? null,
        items: checkoutData.orderItems.map((item) => ({
          productId: item.providerProductId,
          quantity: Number(item.quantity),
          amount: Number(item.unitPrice),
        })),
      });

      await deps.db.update(transactionBaskets).set({ status: "converted", updatedAt: new Date() }).where(and(
        eq(transactionBaskets.id, checkoutData.basketId),
        eq(transactionBaskets.status, "abandoned"),
      ));

      return { checkoutUrl, orderId: checkoutData.orderId };
    } catch (error) {
      await Promise.all([
        deps.checkoutIntents.markFailed({ id: checkoutData.intent.id }),
        deps.db.update(transactionOrders).set({ status: "failed", failedAt: new Date(), updatedAt: new Date() }).where(eq(transactionOrders.id, checkoutData.orderId)),
        deps.db.update(transactionBaskets).set({ status: "draft", updatedAt: new Date() }).where(and(
          eq(transactionBaskets.id, checkoutData.basketId),
          eq(transactionBaskets.status, "abandoned"),
        )),
      ]);
      throw error;
    }
  }

  async function handleTransactionPayment(input: {
    userId: string;
    orderId: string;
    checkoutReferenceId: string;
    paymentId: string;
    paymentStatus: "completed" | "pending" | "failed";
    providerCustomerId?: string | null;
    currency: string;
    totalAmount: number;
    taxAmount: number;
    cartItems?: Array<{ productId: string; quantity: number }>;
  }) {
    const intent = await deps.checkoutIntents.findByReferenceId(input.checkoutReferenceId);
    if (!intent) throw new Error(`Refusing payment ${input.paymentId}: checkout intent ${input.checkoutReferenceId} was not found.`);
    if (intent.userId !== input.userId || intent.billingMode !== "transactions" || intent.productId !== createTransactionOrderProductId(input.orderId)) {
      throw new Error(`Refusing payment ${input.paymentId}: checkout intent mismatch.`);
    }

    return deps.db.transaction(async (tx) => { const order = await tx.query.transactionOrders.findFirst({ where: eq(transactionOrders.id, input.orderId) });
    if (!order) throw new Error(`Refusing payment ${input.paymentId}: transaction order was not found.`);
    if (order.userId !== input.userId) throw new Error(`Refusing payment ${input.paymentId}: transaction order user mismatch.`);
    const subtotalAmount = validateTransactionPaymentAmounts(input);
    if (order.status === "paid" && order.paymentId === input.paymentId) {
      validatePaymentReplay(order, input);
    }
    if (order.currency !== input.currency) throw new Error(`Refusing payment ${input.paymentId}: expected ${order.currency}, received ${input.currency}.`);
    if (subtotalAmount !== Number(order.subtotalAmount)) {
      throw new Error(`Refusing payment ${input.paymentId}: transaction subtotal mismatch.`);
    }
    if (order.status === "pending_payment" && order.paymentId && order.paymentId !== input.paymentId) {
      throw new Error(`Refusing payment ${input.paymentId}: transaction order payment mismatch.`);
    }
    
    const orderItems = await tx.query.transactionOrderItems.findMany({ where: eq(transactionOrderItems.orderId, order.id) });
    validateProviderCartItems({ expected: orderItems, received: input.cartItems });
    
    if (order.status === "paid" && order.paymentId === input.paymentId) {
      return order;
    }
    if (order.status !== "pending_payment") {
      throw new Error(`Refusing payment ${input.paymentId}: transaction order is ${order.status}.`);
    }
    
    if (input.paymentStatus === "pending") {
      const [updatedOrder] = await tx.update(transactionOrders).set({
        paymentId: input.paymentId,
        providerCustomerId: input.providerCustomerId ?? null,
        subtotalAmount: Number(order.subtotalAmount),
        taxAmount: input.taxAmount,
        totalAmount: input.totalAmount,
        updatedAt: new Date(),
      }).where(and(
        eq(transactionOrders.id, order.id),
        eq(transactionOrders.status, "pending_payment"),
        compatiblePaymentIdentity(input.paymentId),
      )).returning();
      if (!updatedOrder) return handleChangedOrder(tx, input, "pending");
      await deps.checkoutIntents.markPending({ id: intent.id, paymentId: input.paymentId }, tx);
      return updatedOrder;
    }
    
    if (input.paymentStatus === "failed") {
      const [updatedOrder] = await tx.update(transactionOrders).set({
        status: "failed",
        paymentId: input.paymentId,
        subtotalAmount: Number(order.subtotalAmount),
        taxAmount: input.taxAmount,
        totalAmount: input.totalAmount,
        failedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(
        eq(transactionOrders.id, order.id),
        eq(transactionOrders.status, "pending_payment"),
        compatiblePaymentIdentity(input.paymentId),
      )).returning();
      if (!updatedOrder) return handleChangedOrder(tx, input, "failed");
      await deps.checkoutIntents.markFailed({ id: intent.id, paymentId: input.paymentId }, tx);
      return updatedOrder;
    }
    
    const now = new Date();
    const [updatedOrder] = await tx.update(transactionOrders).set({
      status: "paid",
      paymentId: input.paymentId,
      providerCustomerId: input.providerCustomerId ?? null,
      subtotalAmount: Number(order.subtotalAmount),
      taxAmount: input.taxAmount,
      totalAmount: input.totalAmount,
      paidAt: now,
      fulfilledAt: now,
      updatedAt: now,
    }).where(and(
      eq(transactionOrders.id, order.id),
      eq(transactionOrders.status, "pending_payment"),
      compatiblePaymentIdentity(input.paymentId),
    )).returning();
    if (!updatedOrder) return handleChangedOrder(tx, input, "completed");
    
    const entitlementRows = (orderItems as OrderItemForEntitlement[]).flatMap((item) => expandEntitlementUnits({
      orderItemId: item.id,
      quantity: Number(item.quantity),
    }).map((unit) => ({
      userId: order.userId,
      orderId: order.id,
      orderItemId: item.id,
      unitIndex: unit.unitIndex,
      productKey: item.productKey,
      status: "available" as const,
      sourcePaymentId: input.paymentId,
      metadata: item.metadata,
    })));
    
    if (entitlementRows.length > 0) {
      await tx.insert(transactionEntitlements).values(entitlementRows).onConflictDoNothing();
    }
    await deps.checkoutIntents.markCompleted({ id: intent.id, paymentId: input.paymentId }, tx);
    return updatedOrder; });
  }

  async function handleChangedOrder(
    tx: PlatformDbTransaction,
    input: TransactionPaymentAmounts & { orderId: string },
    paymentStatus: "completed" | "pending" | "failed",
  ) {
    const changedOrder = await tx.query.transactionOrders.findFirst({ where: eq(transactionOrders.id, input.orderId) });
    if (changedOrder?.status === "paid" && changedOrder.paymentId === input.paymentId) {
      validatePaymentReplay(changedOrder, input);
      return changedOrder;
    }
    if (paymentStatus === "pending" && changedOrder?.status === "pending_payment" && changedOrder.paymentId) {
      if (changedOrder.paymentId !== input.paymentId) {
        throw new Error(`Refusing payment ${input.paymentId}: transaction order payment mismatch.`);
      }
      validatePaymentReplay(changedOrder, input);
      return changedOrder;
    }
    throw new Error(`Refusing payment ${input.paymentId}: transaction order is ${changedOrder?.status ?? "missing"}.`);
  }
  async function processTransactionRefund(paymentId: string, refundId?: string) {
    return deps.db.transaction(async (tx) => { const order = await tx.query.transactionOrders.findFirst({ where: eq(transactionOrders.paymentId, paymentId) });
    if (!order) throw new Error("Transaction order not found");
    if (order.status === "refunded") return order;
    if (order.status !== "paid" && order.status !== "refund_pending") {
      throw new Error("Only paid transaction orders can be refunded");
    }
    
    const entitlements = await tx.query.transactionEntitlements.findMany({
      where: eq(transactionEntitlements.orderId, order.id),
    });
    if (entitlements.some((entitlement) => entitlement.status === "consumed")) {
      throw new Error("Orders with consumed entitlements cannot be refunded");
    }
    
    const now = new Date();
    await tx.update(transactionEntitlements).set({
      status: "refunded",
      refundedAt: now,
      updatedAt: now,
    }).where(and(
      eq(transactionEntitlements.orderId, order.id),
      eq(transactionEntitlements.status, "available"),
    ));
    
    const [updatedOrder] = await tx.update(transactionOrders).set({
      status: "refunded",
      updatedAt: now,
    }).where(and(
      eq(transactionOrders.id, order.id),
      inArray(transactionOrders.status, ["paid", "refund_pending"]),
    )).returning();
    if (!updatedOrder) throw new Error("Transaction order changed while the refund was processed");
    
    return {
      ...updatedOrder,
      refundId: refundId ?? null,
    }; });
  }

  async function createTransactionRefund(input: { orderId: string; reason?: string | null; actorUserId?: string }) {
    if (!deps.paymentProvider.createRefund) {
      throw new Error("Payment provider refund support is not configured");
    }

    const claim = await deps.db.transaction(async (tx) => { const order = await tx.query.transactionOrders.findFirst({ where: eq(transactionOrders.id, input.orderId) });
    if (!order) throw new Error("Transaction order not found");
    if (order.status !== "paid") throw new Error("Only paid transaction orders can be refunded");
    if (!order.paymentId) throw new Error("Transaction order has no payment ID");
    if (order.paymentProvider !== deps.paymentProvider.name) {
      throw new Error(`Payment provider is not configured: ${order.paymentProvider}`);
    }
    
    const entitlements = await tx.query.transactionEntitlements.findMany({
      where: eq(transactionEntitlements.orderId, order.id),
    });
    if (entitlements.some((entitlement) => entitlement.status === "consumed")) {
      throw new Error("Orders with consumed entitlements cannot be refunded");
    }
    
    const entitlementIds = entitlements
      .filter((entitlement) => entitlement.status === "available")
      .map((entitlement) => entitlement.id);
    if (entitlementIds.length > 0) {
      const claimed = await tx.update(transactionEntitlements).set({
        status: "refunded",
        refundedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(
        inArray(transactionEntitlements.id, entitlementIds),
        eq(transactionEntitlements.status, "available"),
      )).returning();
      if (claimed.length !== entitlementIds.length) {
        throw new Error("Transaction entitlements changed while the refund was prepared");
      }
    }
    
    const [claimedOrder] = await tx.update(transactionOrders).set({
      status: "refund_pending",
      updatedAt: new Date(),
    }).where(and(eq(transactionOrders.id, order.id), eq(transactionOrders.status, "paid"))).returning();
    if (!claimedOrder) throw new Error("Transaction order changed while the refund was prepared");
    return { order: claimedOrder, entitlementIds }; });
    const paymentId = claim.order.paymentId;
    if (!paymentId) throw new Error("Transaction order has no payment identifier");

    let refund;
    try {
      refund = await deps.paymentProvider.createRefund({
        paymentId,
        reason: input.reason ?? null,
        metadata: {
          initiated_by: "admin_api",
          user_id: claim.order.userId,
          local_transaction_order_id: claim.order.id,
          ...(input.actorUserId ? { actor_user_id: input.actorUserId } : {}),
        },
        idempotencyKey: `transaction-refund:${claim.order.paymentProvider}:${paymentId}`,
      });
    } catch (error) {
      await deps.db.transaction(async (tx) => { const [restoredOrder] = await tx.update(transactionOrders).set({
        status: "paid",
        updatedAt: new Date(),
      }).where(and(
        eq(transactionOrders.id, claim.order.id),
        eq(transactionOrders.status, "refund_pending"),
      )).returning({ id: transactionOrders.id });
      if (!restoredOrder || claim.entitlementIds.length === 0) return;
      await tx.update(transactionEntitlements).set({
        status: "available",
        refundedAt: null,
        updatedAt: new Date(),
      }).where(and(
        inArray(transactionEntitlements.id, claim.entitlementIds),
        eq(transactionEntitlements.status, "refunded"),
      )); });
      throw error;
    }

    const order = await processTransactionRefund(paymentId, refund.refundId);
    return { refund, order };
  }


  async function listOrders(userId: string) {
    const orders = await deps.db.query.transactionOrders.findMany({
      where: and(eq(transactionOrders.userId, userId), customerVisibleTransactionOrderCondition()),
      orderBy: desc(transactionOrders.createdAt),
      limit: 50,
    });
    if (orders.length === 0) return [];

    const items = await deps.db.query.transactionOrderItems.findMany({
      where: inArray(transactionOrderItems.orderId, orders.map((order) => order.id)),
    });
    const itemsByOrderId = new Map<string, TransactionOrderItemRecord[]>();
    for (const item of items) {
      const orderItems = itemsByOrderId.get(item.orderId) ?? [];
      orderItems.push(item);
      itemsByOrderId.set(item.orderId, orderItems);
    }

    return orders.map((order) => serializeOrder(order, itemsByOrderId.get(order.id) ?? []));
  }

  async function getOrder(userId: string, orderId: string) {
    const order = await deps.db.query.transactionOrders.findFirst({
      where: and(
        eq(transactionOrders.id, orderId),
        eq(transactionOrders.userId, userId),
        customerVisibleTransactionOrderCondition(),
      ),
    });
    if (!order) return null;
    const items = await deps.db.query.transactionOrderItems.findMany({ where: eq(transactionOrderItems.orderId, order.id) });
    return serializeOrder(order, items);
  }

  async function listEntitlements(userId: string) {
    return deps.db.query.transactionEntitlements.findMany({
      where: eq(transactionEntitlements.userId, userId),
      orderBy: desc(transactionEntitlements.createdAt),
    });
  }

  async function consumeEntitlement(userId: string, entitlementId: string) {
    const now = new Date();
    const [entitlement] = await deps.db.update(transactionEntitlements).set({
      status: "consumed",
      consumedAt: now,
      updatedAt: now,
    }).where(and(
      eq(transactionEntitlements.id, entitlementId),
      eq(transactionEntitlements.userId, userId),
      eq(transactionEntitlements.status, "available"),
    )).returning();

    if (!entitlement) throw new Error("Transaction entitlement is not available");
    return entitlement;
  }

  return {
    getOrCreateDraftBasket,
    upsertBasketItem,
    removeBasketItem,
    clearBasket,
    checkoutBasket,
    handleTransactionPayment,
    createTransactionRefund,
    processTransactionRefund,
    listOrders,
    getOrder,
    listEntitlements,
    consumeEntitlement,
  };
}
