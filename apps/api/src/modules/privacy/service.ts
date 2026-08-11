import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";

import * as schema from "@platform/platform-db";
import type { PrivacyExportStorage } from "./storage";

const {
  account,
  apiKeys,
  auditEntries,
  checkoutIntents,
  creditPurchases,
  creditTransactions,
  notification,
  session,
  mobileRefreshToken,
  subscriptionPayments,
  user,
  userCredits,
  userDataExportRequests,
  userSubscriptions,
  userDiscounts,
  voucherAssignments,
  transactionBasketItems,
  transactionBaskets,
  transactionEntitlements,
  transactionOrderItems,
  transactionOrders,
  voucherRedemptions,
} = schema;

type UserDataExportStatus = schema.UserDataExportStatus;
type UserRecord = typeof user.$inferSelect;
type AuthAccountRecord = typeof account.$inferSelect;
type SessionRecord = typeof session.$inferSelect;

type DateLike = Date | string | null | undefined;

export type ExportRequestRecord = {
  id: string;
  userId: string;
  status: UserDataExportStatus;
  fileName: string | null;
  fileSizeBytes: number | null;
  downloadTokenHash: string | null;
  storageKey: string | null;
  expiresAt: Date | null;
  downloadedAt: Date | null;
  failedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PrivacyServiceDeps = {
  db: schema.PlatformDb;
  storage: PrivacyExportStorage;
  now?: () => Date;
  enqueueExport: (
    executor: schema.PlatformDbExecutor,
    input: { exportId: string; userId: string },
  ) => Promise<unknown>;
  exportProductData: (userId: string) => Promise<Record<string, unknown>>;
};

const EXPORT_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000;

function toIso(value: DateLike): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function serializeExportData(bundle: unknown) {
  return JSON.stringify(bundle, null, 2);
}

function buildExportFileName(requestId: string) {
  return `user-data-export-${requestId}.json`;
}

function buildExportStorageKey(requestId: string) {
  return `privacy-exports/${requestId}.json`;
}

export function hashExportToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sanitizeAuthAccount(accountRecord: AuthAccountRecord) {
  return {
    id: accountRecord.id,
    accountId: accountRecord.accountId,
    providerId: accountRecord.providerId,
    scope: accountRecord.scope ?? null,
    accessTokenExpiresAt: toIso(accountRecord.accessTokenExpiresAt),
    refreshTokenExpiresAt: toIso(accountRecord.refreshTokenExpiresAt),
    createdAt: toIso(accountRecord.createdAt),
    updatedAt: toIso(accountRecord.updatedAt),
  };
}

export function sanitizeSession(sessionRecord: SessionRecord) {
  return {
    id: sessionRecord.id,
    expiresAt: toIso(sessionRecord.expiresAt),
    ipAddress: sessionRecord.ipAddress ?? null,
    userAgent: sessionRecord.userAgent ?? null,
    createdAt: toIso(sessionRecord.createdAt),
    updatedAt: toIso(sessionRecord.updatedAt),
  };
}

function sanitizeAuditReference(entry: Record<string, unknown>) {
  const safeEntry = { ...entry };
  delete safeEntry.error;
  return safeEntry;
}

export function buildUserDataExport(input: {
  generatedAt: Date;
  user: UserRecord;
  authAccounts: AuthAccountRecord[];
  sessions: SessionRecord[];
  notifications: Record<string, unknown>[];
  creditBalance: Record<string, unknown> | null;
  creditTransactions: Record<string, unknown>[];
  creditPurchases: Record<string, unknown>[];
  voucherAssignments: Record<string, unknown>[];
  voucherRedemptions: Record<string, unknown>[];
  discountAssignments: Record<string, unknown>[];
  subscriptions: Record<string, unknown>[];
  subscriptionPayments: Record<string, unknown>[];
  checkoutIntents: Record<string, unknown>[];
  auditReferences: Record<string, unknown>[];
  apiKeys: Record<string, unknown>[];
  mobileRefreshTokens: Record<string, unknown>[];
  productData: Record<string, unknown>;
  transactionBaskets: Record<string, unknown>[];
  transactionBasketItems: Record<string, unknown>[];
  transactionOrders: Record<string, unknown>[];
  transactionOrderItems: Record<string, unknown>[];
  transactionEntitlements: Record<string, unknown>[];
}) {
  return {
    generatedAt: input.generatedAt.toISOString(),
    userId: input.user.id,
    profile: {
      id: input.user.id,
      name: input.user.name,
      email: input.user.email,
      emailVerified: input.user.emailVerified,
      image: input.user.image ?? null,
      role: input.user.role ?? null,
      locale: input.user.locale ?? null,
      phone: input.user.phone ?? null,
      street: input.user.street ?? null,
      number: input.user.number ?? null,
      zipcode: input.user.zipcode ?? null,
      town: input.user.town ?? null,
      countryId: input.user.countryId ?? null,
      banned: input.user.banned ?? null,
      banReason: input.user.banReason ?? null,
      banExpires: toIso(input.user.banExpires),
      twoFactorEnabled: input.user.twoFactorEnabled ?? null,
      createdAt: toIso(input.user.createdAt),
      updatedAt: toIso(input.user.updatedAt),
    },
    authAccounts: input.authAccounts.map(sanitizeAuthAccount),
    sessions: input.sessions.map(sanitizeSession),
    notifications: input.notifications,
    credits: {
      balance: input.creditBalance,
      transactions: input.creditTransactions,
      purchases: input.creditPurchases,
    },
    vouchers: {
      assignments: input.voucherAssignments,
      redemptions: input.voucherRedemptions,
    },
    discounts: {
      assignments: input.discountAssignments,
    },
    subscriptions: {
      subscriptions: input.subscriptions,
      payments: input.subscriptionPayments,
      checkoutIntents: input.checkoutIntents,
    },
    auditReferences: input.auditReferences.map(sanitizeAuditReference),
    apiKeys: input.apiKeys,
    mobileRefreshTokens: input.mobileRefreshTokens,
    entitlements: {
      transactions: input.transactionEntitlements,
    },
    transactions: {
      baskets: input.transactionBaskets,
      basketItems: input.transactionBasketItems,
      orders: input.transactionOrders,
      orderItems: input.transactionOrderItems,
    },
    productData: input.productData,
  };
}

function toSummary(row: ExportRequestRecord) {
  return {
    id: row.id,
    status: row.status,
    fileName: row.fileName,
    fileSizeBytes: row.fileSizeBytes,
    expiresAt: toIso(row.expiresAt),
    downloadedAt: toIso(row.downloadedAt),
    failedReason: row.failedReason,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function downloadUserDataExportCore(input: {
  userId: string;
  request: ExportRequestRecord | null;
  rawToken: string;
  now: Date;
}):
  | { ok: true; id: string; fileName: string; storageKey: string }
  | { ok: false; error: "EXPORT_NOT_FOUND" | "EXPORT_NOT_READY" | "EXPORT_EXPIRED" } {
  const { request } = input;
  if (!request) return { ok: false, error: "EXPORT_NOT_FOUND" };
  if (request.userId !== input.userId) return { ok: false, error: "EXPORT_NOT_FOUND" };
  if (request.status !== "ready" || !request.fileName || !request.downloadTokenHash || !request.storageKey) {
    return { ok: false, error: "EXPORT_NOT_READY" };
  }
  if (request.expiresAt && request.expiresAt <= input.now) return { ok: false, error: "EXPORT_EXPIRED" };
  if (hashExportToken(input.rawToken) !== request.downloadTokenHash) return { ok: false, error: "EXPORT_NOT_FOUND" };

  return {
    ok: true,
    id: request.id,
    fileName: request.fileName,
    storageKey: request.storageKey,
  };
}

export function createPrivacyService(deps: PrivacyServiceDeps) {
  const now = deps.now ?? (() => new Date());

  async function deleteStorageObjectBestEffort(storageKey: string | null) {
    if (!storageKey) return;
    try {
      await deps.storage.delete(storageKey);
    } catch {
      // Cleanup is best effort after the database row has made the object inaccessible.
    }
  }

  async function listExports(userId: string) {
    const rows = await deps.db
      .select()
      .from(userDataExportRequests)
      .where(eq(userDataExportRequests.userId, userId))
      .orderBy(desc(userDataExportRequests.createdAt))
      .limit(20);

    return rows.map(toSummary);
  }

  async function createExport(userId: string) {
    const expired = await deps.db
      .update(userDataExportRequests)
      .set({ status: "expired", downloadTokenHash: null, updatedAt: now() })
      .where(and(
        eq(userDataExportRequests.userId, userId),
        inArray(userDataExportRequests.status, ["pending", "ready"]),
        lt(userDataExportRequests.expiresAt, now()),
      ))
      .returning({ storageKey: userDataExportRequests.storageKey });
    await Promise.all(expired.map((row) => deleteStorageObjectBestEffort(row.storageKey)));

    const expiresAt = new Date(now().getTime() + EXPORT_EXPIRATION_MS);
    const downloadToken = randomBytes(32).toString("hex");
    const request = await deps.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(userDataExportRequests)
        .values({
          userId,
          status: "pending",
          expiresAt,
          downloadTokenHash: hashExportToken(downloadToken),
        })
        .returning();
      if (!created) return null;
      await deps.enqueueExport(tx, { exportId: created.id, userId });
      return created;
    });
    if (!request) return { ok: false, error: "Failed to create export request" } as const;
    return { ok: true, data: { ...toSummary(request), downloadToken } } as const;
  }

  async function generateExport(exportId: string, userId: string) {
    const [request] = await deps.db
      .select()
      .from(userDataExportRequests)
      .where(and(
        eq(userDataExportRequests.id, exportId),
        eq(userDataExportRequests.userId, userId),
        eq(userDataExportRequests.status, "pending"),
        gt(userDataExportRequests.expiresAt, now()),
      ))
      .limit(1);
    if (!request) return { ok: false, error: "EXPORT_NOT_PENDING" } as const;
    const storageKey = buildExportStorageKey(request.id);
    let uploaded = false;
    try {
      const userRows = await deps.db.select().from(user).where(eq(user.id, userId)).limit(1);
      const userRecord = userRows[0];
      if (!userRecord) {
        throw new Error("User not found");
      }

      const [
        authAccounts,
        userSessions,
        userNotifications,
        creditBalanceRows,
        creditTxns,
        purchases,
        voucherAssigns,
        voucherRedeems,
        discountAssigns,
        subscriptions,
        subscriptionPaymentRows,
        checkoutIntentRows,
        auditRefs,
        keyRows,
        refreshTokenRows,
        basketRows,
        orderRows,
        entitlementRows,
        productData,
      ] = await Promise.all([
        deps.db.select().from(account).where(eq(account.userId, userId)),
        deps.db.select().from(session).where(eq(session.userId, userId)),
        deps.db.select().from(notification).where(eq(notification.userId, userId)),
        deps.db.select().from(userCredits).where(eq(userCredits.userId, userId)).limit(1),
        deps.db.select().from(creditTransactions).where(eq(creditTransactions.userId, userId)).orderBy(desc(creditTransactions.createdAt)),
        deps.db.select().from(creditPurchases).where(eq(creditPurchases.userId, userId)).orderBy(desc(creditPurchases.createdAt)),
        deps.db.select().from(voucherAssignments).where(eq(voucherAssignments.userId, userId)),
        deps.db.select().from(voucherRedemptions).where(eq(voucherRedemptions.userId, userId)),
        deps.db.select().from(userDiscounts).where(eq(userDiscounts.userId, userId)),
        deps.db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, userId)),
        deps.db.select().from(subscriptionPayments).where(eq(subscriptionPayments.userId, userId)).orderBy(desc(subscriptionPayments.createdAt)),
        deps.db.select().from(checkoutIntents).where(eq(checkoutIntents.userId, userId)).orderBy(desc(checkoutIntents.createdAt)),
        deps.db.select().from(auditEntries).where(eq(auditEntries.actorId, userId)).orderBy(desc(auditEntries.createdAt)),
        deps.db.select({
          id: apiKeys.id,
          name: apiKeys.name,
          keyPrefix: apiKeys.keyPrefix,
          scopes: apiKeys.scopes,
          lastUsedAt: apiKeys.lastUsedAt,
          expiresAt: apiKeys.expiresAt,
          revokedAt: apiKeys.revokedAt,
          createdAt: apiKeys.createdAt,
          updatedAt: apiKeys.updatedAt,
        }).from(apiKeys).where(eq(apiKeys.userId, userId)),
        deps.db.select({
          id: mobileRefreshToken.id,
          expiresAt: mobileRefreshToken.expiresAt,
          revokedAt: mobileRefreshToken.revokedAt,
          createdAt: mobileRefreshToken.createdAt,
        }).from(mobileRefreshToken).where(eq(mobileRefreshToken.userId, userId)),
        deps.db.select().from(transactionBaskets).where(eq(transactionBaskets.userId, userId)).orderBy(desc(transactionBaskets.createdAt)),
        deps.db.select().from(transactionOrders).where(eq(transactionOrders.userId, userId)).orderBy(desc(transactionOrders.createdAt)),
        deps.db.select().from(transactionEntitlements).where(eq(transactionEntitlements.userId, userId)).orderBy(desc(transactionEntitlements.createdAt)),
        deps.exportProductData(userId),
      ]);

      const [basketItemRows, orderItemRows] = await Promise.all([
        basketRows.length
          ? deps.db.select().from(transactionBasketItems).where(inArray(transactionBasketItems.basketId, basketRows.map((row: { id: string }) => row.id)))
          : Promise.resolve([]),
        orderRows.length
          ? deps.db.select().from(transactionOrderItems).where(inArray(transactionOrderItems.orderId, orderRows.map((row: { id: string }) => row.id)))
          : Promise.resolve([]),
      ]);

      const bundle = buildUserDataExport({
        generatedAt: now(),
        user: userRecord,
        authAccounts,
        sessions: userSessions,
        notifications: userNotifications,
        creditBalance: creditBalanceRows[0] ?? null,
        creditTransactions: creditTxns,
        creditPurchases: purchases,
        voucherAssignments: voucherAssigns,
        voucherRedemptions: voucherRedeems,
        discountAssignments: discountAssigns,
        subscriptions,
        subscriptionPayments: subscriptionPaymentRows,
        checkoutIntents: checkoutIntentRows,
        auditReferences: auditRefs,
        apiKeys: keyRows,
        mobileRefreshTokens: refreshTokenRows,
        transactionBaskets: basketRows,
        transactionBasketItems: basketItemRows,
        transactionOrders: orderRows,
        transactionOrderItems: orderItemRows,
        productData,
        transactionEntitlements: entitlementRows,
      });
      const fileName = buildExportFileName(request.id);
      const contents = serializeExportData(bundle);
      const fileSizeBytes = Buffer.byteLength(contents, "utf8");
      await deps.storage.put(storageKey, contents);
      uploaded = true;

      const [ready] = await deps.db
        .update(userDataExportRequests)
        .set({
          status: "ready",
          fileName,
          fileSizeBytes,
          storageKey,
          updatedAt: now(),
        })
        .where(and(
          eq(userDataExportRequests.id, request.id),
          eq(userDataExportRequests.userId, userId),
          eq(userDataExportRequests.status, "pending"),
          gt(userDataExportRequests.expiresAt, now()),
        ))
        .returning();
      if (!ready) throw new Error("Export is no longer pending");

      return { ok: true, data: toSummary(ready) };
    } catch (error) {
      if (uploaded) await deleteStorageObjectBestEffort(storageKey);
      await deps.db
        .update(userDataExportRequests)
        .set({
          status: "failed",
          fileName: null,
          fileSizeBytes: null,
          storageKey: null,
          failedReason: "generation_error",
          updatedAt: now(),
        })
        .where(eq(userDataExportRequests.id, request.id));

      return { ok: false, error: error instanceof Error ? error.message : "Failed to generate export" };
    }
  }

  async function cancelExport(userId: string, exportId: string) {
    const rows = await deps.db
      .update(userDataExportRequests)
      .set({ status: "expired", downloadTokenHash: null, updatedAt: now() })
      .where(
        and(
          eq(userDataExportRequests.id, exportId),
          eq(userDataExportRequests.userId, userId),
          inArray(userDataExportRequests.status, ["pending", "ready"]),
        ),
      )
      .returning();

    const request = rows[0];
    if (!request) return { ok: false, error: "EXPORT_NOT_FOUND" } as const;
    await deleteStorageObjectBestEffort(request.storageKey);
    return { ok: true, data: toSummary(request) } as const;
  }

  async function downloadExport(userId: string, exportId: string, rawToken: string) {
    const consumedAt = now();
    const [request] = await deps.db
      .select()
      .from(userDataExportRequests)
      .where(and(
        eq(userDataExportRequests.id, exportId),
        eq(userDataExportRequests.userId, userId),
      ))
      .limit(1);

    const authorized = downloadUserDataExportCore({
      userId,
      request: request ?? null,
      rawToken,
      now: consumedAt,
    });
    if (!authorized.ok) return { ok: false, error: "EXPORT_NOT_FOUND" } as const;

    const contents = await deps.storage.get(authorized.storageKey);
    if (contents === null) return { ok: false, error: "EXPORT_NOT_FOUND" } as const;

    const [consumed] = await deps.db
      .update(userDataExportRequests)
      .set({
        status: "downloaded",
        downloadedAt: consumedAt,
        downloadTokenHash: null,
        updatedAt: consumedAt,
      })
      .where(and(
        eq(userDataExportRequests.id, exportId),
        eq(userDataExportRequests.userId, userId),
        eq(userDataExportRequests.status, "ready"),
        eq(userDataExportRequests.downloadTokenHash, hashExportToken(rawToken)),
        gt(userDataExportRequests.expiresAt, consumedAt),
      ))
      .returning({ id: userDataExportRequests.id });
    if (!consumed) return { ok: false, error: "EXPORT_NOT_FOUND" } as const;

    await deps.storage.delete(authorized.storageKey);
    return {
      ok: true as const,
      id: authorized.id,
      fileName: authorized.fileName,
      contents,
    };
  }

  async function expireExports() {
    const rows = await deps.db
      .update(userDataExportRequests)
      .set({ status: "expired", downloadTokenHash: null, updatedAt: now() })
      .where(and(
        inArray(userDataExportRequests.status, ["pending", "ready"]),
        lt(userDataExportRequests.expiresAt, now()),
      ))
      .returning({ id: userDataExportRequests.id, storageKey: userDataExportRequests.storageKey });
    await Promise.all(rows.map((row) => deleteStorageObjectBestEffort(row.storageKey)));

    return { expired: rows.length };
  }

  return {
    listExports,
    createExport,
    generateExport,
    cancelExport,
    downloadExport,
    expireExports,
  };
}
