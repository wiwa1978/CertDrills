import { eq } from "drizzle-orm";

import { checkoutIntents } from "@platform/platform-db";
import type { PlatformDb, PlatformDbExecutor } from "@platform/platform-db";

export type CheckoutBillingMode = "credits" | "subscriptions" | "transactions";
export type CheckoutIntentStatus = "pending" | "completed" | "failed" | "cancelled" | "expired";

export type CheckoutIntentRecord = {
  id: string;
  userId: string;
  billingMode: CheckoutBillingMode;
  packageKey: string | null;
  planKey: string | null;
  productId: string;
  discountCode: string | null;
  referenceId: string;
  paymentId: string | null;
  status: CheckoutIntentStatus;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  failedAt: Date | null;
};

export type CreateCheckoutIntentInput = {
  userId: string;
  billingMode: CheckoutBillingMode;
  packageKey?: string;
  planKey?: string;
  productId: string;
  discountCode?: string;
  metadata?: Record<string, unknown>;
};

export type CheckoutIntentsService = {
  create: (input: CreateCheckoutIntentInput, executor?: PlatformDbExecutor) => Promise<CheckoutIntentRecord>;
  findByReferenceId: (referenceId: string) => Promise<CheckoutIntentRecord | null>;
  markPending: (input: { id: string; paymentId: string }, executor?: PlatformDbExecutor) => Promise<unknown>;
  markCompleted: (input: { id: string; paymentId: string }, executor?: PlatformDbExecutor) => Promise<unknown>;
  markFailed: (input: { id: string; paymentId?: string | null }, executor?: PlatformDbExecutor) => Promise<unknown>;
};

type CheckoutIntentsServiceDeps = {
  db: PlatformDb;
};

export function createCheckoutIntentReference() {
  return crypto.randomUUID();
}

export function createCheckoutIntentsService(deps: CheckoutIntentsServiceDeps): CheckoutIntentsService {
  async function create(input: CreateCheckoutIntentInput, executor: PlatformDbExecutor = deps.db) {
    const [intent] = await executor
      .insert(checkoutIntents)
      .values({
        userId: input.userId,
        billingMode: input.billingMode,
        packageKey: input.packageKey ?? null,
        planKey: input.planKey ?? null,
        productId: input.productId,
        discountCode: input.discountCode ?? null,
        referenceId: createCheckoutIntentReference(),
        status: "pending",
        metadata: input.metadata ?? null,
      })
      .returning();

    return intent;
  }

  async function findByReferenceId(referenceId: string) {
    return (await deps.db.query.checkoutIntents.findFirst({
      where: eq(checkoutIntents.referenceId, referenceId),
    })) ?? null;
  }

  async function markPending(input: { id: string; paymentId: string }, executor: PlatformDbExecutor = deps.db) {
    return executor
      .update(checkoutIntents)
      .set({
        status: "pending",
        paymentId: input.paymentId,
        updatedAt: new Date(),
      })
      .where(eq(checkoutIntents.id, input.id));
  }

  async function markCompleted(input: { id: string; paymentId: string }, executor: PlatformDbExecutor = deps.db) {
    const now = new Date();
    return executor
      .update(checkoutIntents)
      .set({
        status: "completed",
        paymentId: input.paymentId,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(checkoutIntents.id, input.id));
  }

  async function markFailed(input: { id: string; paymentId?: string | null }, executor: PlatformDbExecutor = deps.db) {
    const now = new Date();
    return executor
      .update(checkoutIntents)
      .set({
        status: "failed",
        paymentId: input.paymentId ?? null,
        failedAt: now,
        updatedAt: now,
      })
      .where(eq(checkoutIntents.id, input.id));
  }

  return {
    create,
    findByReferenceId,
    markPending,
    markCompleted,
    markFailed,
  };
}
