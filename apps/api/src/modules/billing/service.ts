import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import {
  creditPurchases,
  creditTransactions,
  creditUsageEvents,
  user,
  userCredits,
} from "@platform/platform-db";

import type { ConsumeCreditsRequest, ConsumeCreditsResponse } from "@platform/contracts/wire";

import { creditPackages } from "../../config/billing";
import type { PaymentProvider } from "../payments/provider";

type CreditLedgerTransactionType = "purchase" | "usage" | "refund" | "bonus" | "admin_adjustment" | "voucher";
type CreditLedgerReferenceType = "payment" | "feature_usage" | "admin" | "bonus" | "voucher";

type ApplyCreditDeltaInput = {
  userId: string;
  amount: number;
  type: CreditLedgerTransactionType;
  description: string;
  referenceType?: CreditLedgerReferenceType;
  referenceId?: string;
  metadata?: Record<string, unknown>;
  allowNegativeBalance?: boolean;
  createdAt?: Date;
};

type ApplyCreditDeltaResult = {
  transactionId: string;
  balanceBefore: string;
  balanceAfter: string;
};

type BillingServiceDeps = {
  db: any;
  paymentProvider: PaymentProvider;
  notifications: {
    createNotification: (input: {
      userId: string;
      title: string;
      message: string;
      type?: "info" | "warning" | "success" | "error";
      category: string;
      data?: Record<string, unknown>;
      showAsBanner?: boolean;
      bannerExpiresAt?: Date;
    }) => Promise<unknown>;
  };
};

type PaymentStatus = "completed" | "pending" | "failed" | "refunded";

type PaymentSnapshot = {
  provider: string;
  customerId?: string;
  packageKey: string;
  priceExclVat: number;
  priceInclVat: number;
  vatAmount: number;
  currency: string;
};

function buildPaymentSnapshot(args: PaymentSnapshot): PaymentSnapshot {
  return {
    provider: args.provider,
    ...(args.customerId ? { customerId: args.customerId } : {}),
    packageKey: args.packageKey,
    priceExclVat: args.priceExclVat,
    priceInclVat: args.priceInclVat,
    vatAmount: args.vatAmount,
    currency: args.currency,
  };
}

async function getOrInitializeCredits(db: any, userId: string) {
  const existing = await db.query.userCredits.findFirst({
    where: (table: any, operators: any) => operators.eq(table.userId, userId),
  });

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(userCredits)
    .values({
      userId,
      balance: "0",
      totalPurchased: "0",
      totalSpent: "0",
    })
    .onConflictDoNothing({ target: userCredits.userId })
    .returning();

  if (created) {
    return created;
  }

  return db.query.userCredits.findFirst({
    where: (table: any, operators: any) => operators.eq(table.userId, userId),
  });
}

async function applyCreditDelta(db: any, input: ApplyCreditDeltaInput): Promise<ApplyCreditDeltaResult> {
  const current = await getOrInitializeCredits(db, input.userId);
  const balanceBefore = Number(current.balance);
  const now = input.createdAt ?? new Date();

  const [updated] = await db
    .update(userCredits)
    .set({
      balance: sql`${userCredits.balance} + ${input.amount}`,
      totalSpent: input.type === "usage" ? sql`${userCredits.totalSpent} + ${Math.abs(input.amount)}` : userCredits.totalSpent,
      updatedAt: now,
    })
    .where(
      and(
        eq(userCredits.userId, input.userId),
        input.allowNegativeBalance ? sql`true` : sql`${userCredits.balance} + ${input.amount} >= 0`,
      ),
    )
    .returning({ balanceAfter: userCredits.balance });

  if (!updated) {
    throw new Error("Insufficient credits");
  }

  const balanceAfter = Number(updated.balanceAfter);

  const [transaction] = await db.insert(creditTransactions).values({
    userId: input.userId,
    type: input.type,
    amount: input.amount.toFixed(2),
    description: input.description,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    metadata: input.metadata,
    balanceAfter: balanceAfter.toFixed(2),
    createdAt: now,
  }).returning({ id: creditTransactions.id });

  return {
    transactionId: transaction.id,
    balanceBefore: balanceBefore.toFixed(2),
    balanceAfter: balanceAfter.toFixed(2),
  };
}

export function createBillingService(deps: BillingServiceDeps) {
  function clampLimit(limit: number, max = 100) {
    if (!Number.isFinite(limit)) {
      return Math.min(50, max);
    }

    return Math.min(Math.max(Math.trunc(limit), 1), max);
  }

  async function getCreditBalance(userId: string) {
    return getOrInitializeCredits(deps.db, userId);
  }

  async function getCreditHistory(userId: string, limit = 50) {
    const normalizedLimit = clampLimit(limit);

    return deps.db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, userId))
      .orderBy(desc(creditTransactions.createdAt))
      .limit(normalizedLimit);
  }

  async function getCreditPurchases(userId: string, limit = 50) {
    const normalizedLimit = clampLimit(limit);

    return deps.db
      .select({
        id: creditPurchases.id,
        packageKey: creditPurchases.packageKey,
        credits: creditPurchases.credits,
        bonusCredits: creditPurchases.bonusCredits,
        priceExclVat: creditPurchases.priceExclVat,
        priceInclVat: creditPurchases.priceInclVat,
        paymentSnapshot: creditPurchases.paymentSnapshot,
        paymentStatus: creditPurchases.paymentStatus,
        paymentId: creditPurchases.paymentId,
        createdAt: creditPurchases.createdAt,
      })
      .from(creditPurchases)
      .where(eq(creditPurchases.userId, userId))
      .orderBy(desc(creditPurchases.createdAt))
      .limit(normalizedLimit);
  }

  async function processCreditPurchase(
    userId: string,
    packageKey: string,
    paymentId: string,
    paymentStatus: PaymentStatus,
    providerCustomerId?: string,
    pricingData?: {
      priceExclVat: number;
      priceInclVat: number;
      vatAmount: number;
      currency: string;
    },
    snapshotData?: {
      provider?: string;
      customerId?: string;
    },
  ) {
    const pkg = creditPackages.find((item) => item.key === packageKey);
    if (!pkg) {
      throw new Error(`Credit package not found: ${packageKey}`);
    }
    const creditPackage = pkg;

    const priceExclVat = pricingData?.priceExclVat ?? creditPackage.price;
    const priceInclVat = pricingData?.priceInclVat ?? creditPackage.price;
    const vatAmount = pricingData?.vatAmount ?? 0;
    const currency = pricingData?.currency ?? "EUR";
    const paymentSnapshot = buildPaymentSnapshot({
      provider: snapshotData?.provider ?? "dodo",
      customerId: snapshotData?.customerId ?? providerCustomerId,
      packageKey,
      priceExclVat,
      priceInclVat,
      vatAmount,
      currency,
    });

    const result = await deps.db.transaction(async (tx: any) => {
      async function grantCredits(grantedAt: Date) {
        const baseCredits = creditPackage.credits;
        const bonusCredits = "bonus" in creditPackage ? creditPackage.bonus : 0;
        const totalCredits = baseCredits + bonusCredits;
        const current = await getOrInitializeCredits(tx, userId);

        const [updated] = await tx
          .update(userCredits)
          .set({
            balance: sql`${userCredits.balance} + ${totalCredits}`,
            totalPurchased: sql`${userCredits.totalPurchased} + ${baseCredits}`,
            updatedAt: grantedAt,
          })
          .where(eq(userCredits.userId, userId))
          .returning({ balanceAfter: userCredits.balance });

        const balanceBefore = Number(current.balance);
        const newBalance = Number(updated.balanceAfter);

        await tx.insert(creditTransactions).values({
          userId,
          type: "purchase",
          amount: baseCredits.toString(),
          description: `Package: ${packageKey.charAt(0).toUpperCase() + packageKey.slice(1)}`,
          referenceId: paymentId,
          balanceAfter: (balanceBefore + baseCredits).toString(),
        });

        if (bonusCredits > 0) {
          await tx.insert(creditTransactions).values({
            userId,
            type: "bonus",
            amount: bonusCredits.toString(),
            description: `Bonus credits for ${packageKey.charAt(0).toUpperCase() + packageKey.slice(1)}`,
            referenceId: paymentId,
            balanceAfter: newBalance.toString(),
            createdAt: new Date(grantedAt.getTime() + 1),
          });
        }

        return { credits: totalCredits, amount: priceInclVat / 100, currency };
      }

      const existingPurchase = await tx.query.creditPurchases.findFirst({
        where: eq(creditPurchases.paymentId, paymentId),
      });

      if (existingPurchase) {
        if (existingPurchase.userId !== userId) {
          throw new Error(`Payment ${paymentId} is already associated with another user`);
        }

        if (existingPurchase.creditsGrantedAt && paymentStatus !== "completed") {
          return { purchase: existingPurchase, notificationData: null };
        }

        const shouldGrantCredits = paymentStatus === "completed" && !existingPurchase.creditsGrantedAt;
        const creditsGrantedAt = shouldGrantCredits ? new Date() : existingPurchase.creditsGrantedAt;
        const nextProviderCustomerId = providerCustomerId ?? existingPurchase.providerCustomerId ?? existingPurchase.dodoCustomerId;

        if (existingPurchase.paymentStatus !== paymentStatus || providerCustomerId || shouldGrantCredits || pricingData) {
          await tx
            .update(creditPurchases)
            .set({
              paymentStatus,
              providerCustomerId: nextProviderCustomerId,
              dodoCustomerId: nextProviderCustomerId,
              price: priceInclVat,
              priceExclVat,
              priceInclVat,
              vatAmount,
              currency,
              creditsGrantedAt,
              paymentSnapshot,
              updatedAt: new Date(),
            })
            .where(eq(creditPurchases.id, existingPurchase.id));
        }

        let notificationData: { credits: number; amount: number; currency: string } | null = null;
        if (shouldGrantCredits) {
          notificationData = await grantCredits(creditsGrantedAt);
        }

        const purchase = {
          ...existingPurchase,
          paymentStatus,
          providerCustomerId: nextProviderCustomerId,
          dodoCustomerId: nextProviderCustomerId,
          creditsGrantedAt,
          paymentSnapshot,
        };

        return { purchase, notificationData };
      }

      const creditsGrantedAt = paymentStatus === "completed" ? new Date() : null;

      const [purchase] = await tx
        .insert(creditPurchases)
        .values({
          userId,
          packageKey,
          credits: creditPackage.credits,
          bonusCredits: "bonus" in creditPackage ? creditPackage.bonus : 0,
          price: priceInclVat,
          priceExclVat,
          priceInclVat,
          vatAmount,
          currency,
          paymentId,
          providerCustomerId,
          dodoCustomerId: providerCustomerId,
          paymentStatus,
          creditsGrantedAt,
          paymentSnapshot,
        })
        .returning();

      let notificationData: { credits: number; amount: number; currency: string } | null = null;
      if (creditsGrantedAt) {
        notificationData = await grantCredits(creditsGrantedAt);
      }

      return { purchase, notificationData };
    });

    if (result.notificationData) {
      await deps.notifications.createNotification({
        userId,
        title: "creditPurchaseSuccess.title",
        message: "creditPurchaseSuccess.message",
        type: "success",
        category: "billing",
        data: result.notificationData,
      }).catch(() => undefined);
    }

    return result.purchase;
  }

  async function processCreditReversal(
    paymentId: string,
    reason: "refund" | "dispute",
    metadata: Record<string, string | undefined> = {},
  ) {
    return deps.db.transaction(async (tx: any) => {
      const purchase = await tx.query.creditPurchases.findFirst({
        where: eq(creditPurchases.paymentId, paymentId),
      });

      if (!purchase) {
        throw new Error(`Payment ${paymentId} not found for ${reason}`);
      }

      const nextStatus = reason === "refund" ? "refunded" : "failed";

      if (!purchase.creditsGrantedAt) {
        await tx
          .update(creditPurchases)
          .set({ paymentStatus: nextStatus, updatedAt: new Date() })
          .where(eq(creditPurchases.id, purchase.id));
        return { ...purchase, paymentStatus: nextStatus };
      }

      if (purchase.paymentStatus === nextStatus) {
        return purchase;
      }

      const totalCredits = Number(purchase.credits) + Number(purchase.bonusCredits ?? 0);

      await applyCreditDelta(tx, {
        userId: purchase.userId,
        amount: -totalCredits,
        type: reason === "refund" ? "refund" : "admin_adjustment",
        description: `${reason === "refund" ? "Refund" : "Dispute reversal"}: ${purchase.packageKey.charAt(0).toUpperCase() + purchase.packageKey.slice(1)}`,
        referenceType: "payment",
        referenceId: paymentId,
        metadata,
        allowNegativeBalance: true,
      });

      await tx
        .update(creditPurchases)
        .set({ paymentStatus: nextStatus, updatedAt: new Date() })
        .where(eq(creditPurchases.id, purchase.id));

      return { ...purchase, paymentStatus: nextStatus };
    });
  }

  async function processCreditRefund(paymentId: string, refundId?: string) {
    return processCreditReversal(paymentId, "refund", { refundId });
  }

  async function createCreditRefund(input: { paymentId: string; reason?: string | null; actorUserId?: string }) {
    if (!deps.paymentProvider.createRefund) {
      throw new Error("Payment provider refund support is not configured");
    }

    const purchase = await deps.db.query.creditPurchases.findFirst({
      where: eq(creditPurchases.paymentId, input.paymentId),
    });

    if (!purchase) {
      throw new Error("Credit purchase not found");
    }

    if (purchase.paymentStatus !== "completed") {
      throw new Error("Only completed credit purchases can be refunded");
    }

    const refund = await deps.paymentProvider.createRefund({
      paymentId: purchase.paymentId,
      reason: input.reason ?? null,
      metadata: {
        initiated_by: "admin_api",
        user_id: purchase.userId,
        local_credit_purchase_id: purchase.id,
        ...(input.actorUserId ? { actor_user_id: input.actorUserId } : {}),
      },
      idempotencyKey: `credit-refund:${purchase.paymentProvider}:${purchase.paymentId}`,
    });

    const updatedPurchase = await processCreditRefund(purchase.paymentId, refund.refundId);

    return {
      refund,
      purchase: updatedPurchase,
    };
  }

  async function processCreditDisputeLoss(paymentId: string, disputeId?: string, disputeStatus?: string) {
    return processCreditReversal(paymentId, "dispute", { disputeId, disputeStatus });
  }

  async function getUserByEmail(email: string) {
    const rows = await deps.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    return rows[0] ?? null;
  }

  async function getUserById(userId: string) {
    const rows = await deps.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    return rows[0] ?? null;
  }

  async function getLatestProviderCustomerId(userId: string) {
    const [purchase] = await deps.db
      .select({
        providerCustomerId: creditPurchases.providerCustomerId,
        dodoCustomerId: creditPurchases.dodoCustomerId,
      })
      .from(creditPurchases)
      .where(and(eq(creditPurchases.userId, userId), isNotNull(creditPurchases.providerCustomerId)))
      .orderBy(desc(creditPurchases.createdAt))
      .limit(1);

    if (purchase?.providerCustomerId) {
      return purchase.providerCustomerId;
    }

    const [legacyPurchase] = await deps.db
      .select({ dodoCustomerId: creditPurchases.dodoCustomerId })
      .from(creditPurchases)
      .where(and(eq(creditPurchases.userId, userId), isNotNull(creditPurchases.dodoCustomerId)))
      .orderBy(desc(creditPurchases.createdAt))
      .limit(1);

    return legacyPurchase?.dodoCustomerId ?? null;
  }

  async function downloadInvoice(userId: string, paymentId: string) {
    const [purchase] = await deps.db
      .select({
        id: creditPurchases.id,
        userId: creditPurchases.userId,
        paymentStatus: creditPurchases.paymentStatus,
      })
      .from(creditPurchases)
      .where(eq(creditPurchases.paymentId, paymentId))
      .limit(1);

    if (!purchase) {
      throw new Error("Purchase not found");
    }

    if (purchase.userId !== userId) {
      throw new Error("Unauthorized");
    }

    if (purchase.paymentStatus !== "completed") {
      throw new Error("Invoice not available for this payment");
    }

    if (!deps.paymentProvider.getInvoice) {
      throw new Error("Payment provider invoice support is not configured");
    }

    const invoice = await deps.paymentProvider.getInvoice(paymentId);

    return {
      success: true as const,
      invoiceUrl: invoice.invoiceUrl,
    };
  }

  async function applyAdminCreditAdjustment(userId: string, input: { amount: number; reason: string; notifyUser: boolean; idempotencyKey?: string }) {
    const result = await applyCreditDelta(deps.db, {
      userId,
      amount: input.amount,
      type: "admin_adjustment",
      description: input.reason,
      referenceType: "admin",
      referenceId: input.idempotencyKey,
      allowNegativeBalance: true,
    });

    if (input.notifyUser) {
      deps.notifications.createNotification({
        userId,
        title: "creditAdjustment.title",
        message: "creditAdjustment.message",
        type: input.amount >= 0 ? "success" : "warning",
        category: "billing",
        data: { amount: input.amount, reason: input.reason },
      }).catch(() => undefined);
    }

    return result;
  }

  async function consumeCredits(userId: string, input: ConsumeCreditsRequest): Promise<ConsumeCreditsResponse> {
    return deps.db.transaction(async (tx: any) => {
      const existing = await tx.query.creditUsageEvents.findFirst({
        where: (table: any, operators: any) => operators.and(
          operators.eq(table.userId, userId),
          operators.eq(table.idempotencyKey, input.idempotencyKey),
        ),
      });

      if (existing) {
        const [txRow] = await tx.select({ balanceAfter: creditTransactions.balanceAfter })
          .from(creditTransactions)
          .where(eq(creditTransactions.id, existing.transactionId))
          .limit(1);

        const balanceAfter = txRow?.balanceAfter ?? "0";
        const balanceBefore = (Number(balanceAfter) + Number(existing.amount)).toFixed(2);

        return {
          transactionId: existing.transactionId,
          idempotencyKey: existing.idempotencyKey,
          balanceBefore,
          balanceAfter,
          alreadyProcessed: true,
        };
      }

      const result = await applyCreditDelta(tx, {
        userId,
        amount: -Math.abs(input.amount),
        type: "usage",
        description: input.description ?? `Usage: ${input.featureKey}`,
        referenceType: "feature_usage",
        referenceId: input.idempotencyKey,
        metadata: { featureKey: input.featureKey, ...(input.metadata ?? {}) },
      });

      await tx.insert(creditUsageEvents).values({
        userId,
        featureKey: input.featureKey,
        idempotencyKey: input.idempotencyKey,
        amount: input.amount.toFixed(2),
        transactionId: result.transactionId,
        metadata: input.metadata,
      });

      return {
        transactionId: result.transactionId,
        idempotencyKey: input.idempotencyKey,
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balanceAfter,
        alreadyProcessed: false,
      };
    });
  }

  return {
    getCreditBalance,
    getCreditHistory,
    getCreditPurchases,
    processCreditPurchase,
    createCreditRefund,
    processCreditRefund,
    processCreditDisputeLoss,
    getUserByEmail,
    getUserById,
    getLatestProviderCustomerId,
    getLatestDodoCustomerId: getLatestProviderCustomerId,
    downloadInvoice,
    applyAdminCreditAdjustment,
    consumeCredits,
  };
}
