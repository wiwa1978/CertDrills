import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, inArray, lt } from "drizzle-orm";

import * as schema from "@platform/platform-db";

const {
  account,
  auditEntries,
  checkoutIntents,
  creditPurchases,
  creditTransactions,
  notification,
  session,
  subscriptionPayments,
  user,
  userCredits,
  userDataExportRequests,
  userSubscriptions,
  userDiscounts,
  voucherAssignments,
  voucherRedemptions,
} = schema;

type UserDataExportStatus = schema.UserDataExportStatus;

type DateLike = Date | string | null | undefined;

export type ExportRequestRecord = {
  id: string;
  userId: string;
  status: UserDataExportStatus;
  fileName: string | null;
  fileSizeBytes: number | null;
  downloadTokenHash: string | null;
  exportData: unknown;
  expiresAt: Date | null;
  downloadedAt: Date | null;
  failedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PrivacyServiceDeps = {
  db: any;
  now?: () => Date;
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

export function hashExportToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sanitizeAuthAccount(accountRecord: Record<string, any>) {
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

export function sanitizeSession(sessionRecord: Record<string, any>) {
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
  user: Record<string, any>;
  authAccounts: Record<string, any>[];
  sessions: Record<string, any>[];
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
  | { ok: true; id: string; fileName: string; contents: string }
  | { ok: false; error: "EXPORT_NOT_FOUND" | "EXPORT_NOT_READY" | "EXPORT_EXPIRED" } {
  const { request } = input;
  if (!request) return { ok: false, error: "EXPORT_NOT_FOUND" };
  if (request.userId !== input.userId) return { ok: false, error: "EXPORT_NOT_FOUND" };
  if (request.status !== "ready" || !request.fileName || !request.downloadTokenHash || !request.exportData) {
    return { ok: false, error: "EXPORT_NOT_READY" };
  }
  if (request.expiresAt && request.expiresAt <= input.now) return { ok: false, error: "EXPORT_EXPIRED" };
  if (hashExportToken(input.rawToken) !== request.downloadTokenHash) return { ok: false, error: "EXPORT_NOT_FOUND" };

  return {
    ok: true,
    id: request.id,
    fileName: request.fileName,
    contents: serializeExportData(request.exportData),
  };
}

export function createPrivacyService(deps: PrivacyServiceDeps) {
  const now = deps.now ?? (() => new Date());

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
    await deps.db
      .update(userDataExportRequests)
      .set({ status: "expired", downloadTokenHash: null, exportData: null, updatedAt: now() })
      .where(and(
        eq(userDataExportRequests.userId, userId),
        inArray(userDataExportRequests.status, ["pending", "ready"]),
        lt(userDataExportRequests.expiresAt, now()),
      ));

    const expiresAt = new Date(now().getTime() + EXPORT_EXPIRATION_MS);
    const [request] = await deps.db
      .insert(userDataExportRequests)
      .values({ userId, status: "pending", expiresAt })
      .returning();

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
        deps.db.select().from(auditEntries).where(eq(auditEntries.actorId, userId)).orderBy(desc(auditEntries.createdAt)).limit(100),
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
      });
      const downloadToken = randomBytes(32).toString("hex");
      const fileName = buildExportFileName(request.id);
      const fileSizeBytes = Buffer.byteLength(serializeExportData(bundle), "utf8");

      const [ready] = await deps.db
        .update(userDataExportRequests)
        .set({
          status: "ready",
          fileName,
          fileSizeBytes,
          downloadTokenHash: hashExportToken(downloadToken),
          exportData: bundle,
          updatedAt: now(),
        })
        .where(and(eq(userDataExportRequests.id, request.id), eq(userDataExportRequests.userId, userId)))
        .returning();

      return { ok: true, data: { ...toSummary(ready), downloadToken } };
    } catch (error) {
      await deps.db
        .update(userDataExportRequests)
        .set({ status: "failed", failedReason: "generation_error", updatedAt: now() })
        .where(eq(userDataExportRequests.id, request.id));

      return { ok: false, error: error instanceof Error ? error.message : "Failed to generate export" };
    }
  }

  async function cancelExport(userId: string, exportId: string) {
    const rows = await deps.db
      .update(userDataExportRequests)
      .set({ status: "expired", downloadTokenHash: null, exportData: null, updatedAt: now() })
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
    return { ok: true, data: toSummary(request) } as const;
  }

  async function downloadExport(userId: string, exportId: string, rawToken: string) {
    const rows = await deps.db
      .select()
      .from(userDataExportRequests)
      .where(eq(userDataExportRequests.id, exportId))
      .limit(1);

    const result = downloadUserDataExportCore({ userId, request: rows[0] ?? null, rawToken, now: now() });
    if (!result.ok) return result;

    await deps.db
      .update(userDataExportRequests)
      .set({ status: "downloaded", downloadedAt: now(), downloadTokenHash: null, exportData: null, updatedAt: now() })
      .where(and(eq(userDataExportRequests.id, result.id), eq(userDataExportRequests.userId, userId)));

    return result;
  }

  async function expireExports() {
    const rows = await deps.db
      .update(userDataExportRequests)
      .set({ status: "expired", downloadTokenHash: null, exportData: null, updatedAt: now() })
      .where(and(
        inArray(userDataExportRequests.status, ["pending", "ready"]),
        lt(userDataExportRequests.expiresAt, now()),
      ))
      .returning({ id: userDataExportRequests.id });

    return { expired: rows.length };
  }

  return {
    listExports,
    createExport,
    cancelExport,
    downloadExport,
    expireExports,
  };
}
