import { randomUUID } from "node:crypto";

import { and, count, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";

import { notification, user } from "@platform/platform-db";

type NotificationsServiceDeps = {
  db: any;
};

const SEND_BATCH_SIZE = 500;

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function withBatchData(data: Record<string, unknown> | undefined, batchId: string) {
  return {
    ...(data ?? {}),
    notificationBatchId: batchId,
  };
}

function sanitizeNotificationData(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return data;
  }

  const { notificationBatchId: _notificationBatchId, ...publicData } = data as Record<string, unknown>;
  return publicData;
}

function sanitizeNotificationRow<T extends { data?: unknown }>(row: T): T {
  if (!("data" in row)) {
    return row;
  }

  return {
    ...row,
    data: sanitizeNotificationData(row.data),
  };
}

async function withTransaction<T>(db: any, callback: (tx: any) => Promise<T>) {
  if (typeof db.transaction === "function") {
    return db.transaction(callback);
  }

  return callback(db);
}

export function createNotificationsService(deps: NotificationsServiceDeps) {
  function normalizeLimit(limit: number, max = 100) {
    if (!Number.isFinite(limit)) {
      return Math.min(20, max);
    }

    return Math.min(Math.max(Math.trunc(limit), 1), max);
  }

  function dedupeUserIds(userIds: string[]) {
    return [...new Set(userIds.map((value) => value.trim()).filter(Boolean))];
  }

  async function createNotification(input: {
    userId: string;
    title: string;
    message: string;
    type?: "info" | "warning" | "success" | "error";
    category: string;
    data?: Record<string, unknown>;
    showAsBanner?: boolean;
    bannerExpiresAt?: Date;
  }) {
    const [created] = await deps.db
      .insert(notification)
      .values({
        userId: input.userId,
        title: input.title,
        message: input.message,
        type: input.type ?? "info",
        category: input.category,
        data: input.data ?? null,
        showAsBanner: input.showAsBanner ?? false,
        bannerExpiresAt: input.bannerExpiresAt ?? null,
      })
      .returning();

    return created;
  }

  async function listForUser(userId: string, limit = 20) {
    const normalizedLimit = normalizeLimit(limit, 100);

    const rows = await deps.db
      .select()
      .from(notification)
      .where(eq(notification.userId, userId))
      .orderBy(desc(notification.createdAt))
      .limit(normalizedLimit);

    return rows.map(sanitizeNotificationRow);
  }

  async function getActiveBannerForUser(userId: string) {
    const now = new Date();
    const rows = await deps.db
      .select()
      .from(notification)
      .where(
        and(
          eq(notification.userId, userId),
          eq(notification.showAsBanner, true),
          eq(notification.read, false),
          or(isNull(notification.bannerExpiresAt), gt(notification.bannerExpiresAt, now)),
        ),
      )
      .orderBy(desc(notification.createdAt))
      .limit(1);

    return rows[0] ? sanitizeNotificationRow(rows[0]) : null;
  }

  async function unreadCount(userId: string) {
    const [result] = await deps.db
      .select({ count: count() })
      .from(notification)
      .where(and(eq(notification.userId, userId), eq(notification.read, false)));

    return result?.count ?? 0;
  }

  async function markAsRead(userId: string, notificationId: string) {
    await deps.db
      .update(notification)
      .set({ read: true, readAt: new Date() })
      .where(and(eq(notification.id, notificationId), eq(notification.userId, userId)));
  }

  async function markAllAsRead(userId: string) {
    await deps.db
      .update(notification)
      .set({ read: true, readAt: new Date() })
      .where(and(eq(notification.userId, userId), eq(notification.read, false)));
  }

  async function deleteNotification(userId: string, notificationId: string) {
    await deps.db
      .delete(notification)
      .where(and(eq(notification.id, notificationId), eq(notification.userId, userId)));
  }

  async function getAllNotifications(limit = 50) {
    const normalizedLimit = normalizeLimit(limit, 100);

    const rows = await deps.db
      .select({
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        category: notification.category,
        read: notification.read,
        showAsBanner: notification.showAsBanner,
        bannerExpiresAt: notification.bannerExpiresAt,
        createdAt: notification.createdAt,
      })
      .from(notification)
      .orderBy(desc(notification.createdAt))
      .limit(normalizedLimit);

    return rows.map(sanitizeNotificationRow);
  }

  async function sendNotificationToAllUsers(input: {
    title: string;
    message: string;
    type?: "info" | "warning" | "success" | "error";
    category?: string;
    data?: Record<string, unknown>;
    showAsBanner?: boolean;
    bannerExpiresAt?: Date;
  }) {
    const users = await deps.db.select({ id: user.id }).from(user);
    const batchId = randomUUID();
    const payload = users.map((u: { id: string }) => ({
      userId: u.id,
      title: input.title,
      message: input.message,
      type: input.type ?? "info",
      category: input.category ?? "system",
      data: withBatchData(input.data, batchId),
      showAsBanner: input.showAsBanner ?? false,
      bannerExpiresAt: input.bannerExpiresAt ?? null,
    }));

    const payloadChunks = chunk(payload, SEND_BATCH_SIZE);

    if (payloadChunks.length > 0) {
      await withTransaction(deps.db, async (tx) => {
        for (const payloadChunk of payloadChunks) {
          await tx.insert(notification).values(payloadChunk);
        }
      });
    }

    return {
      sentCount: payload.length,
      skippedCount: 0,
      invalidRecipientCount: 0,
      invalidRecipientIds: [],
      batchId,
    };
  }

  async function sendNotificationToUsers(input: {
    userIds: string[];
    title: string;
    message: string;
    type?: "info" | "warning" | "success" | "error";
    category?: string;
    data?: Record<string, unknown>;
    showAsBanner?: boolean;
    bannerExpiresAt?: Date;
  }) {
    const userIds = dedupeUserIds(input.userIds);
    const existingUsers = userIds.length > 0
      ? await deps.db.select({ id: user.id }).from(user).where(inArray(user.id, userIds))
      : [];
    const validUserIds = new Set(existingUsers.map((existingUser: { id: string }) => existingUser.id));
    const invalidRecipientIds = userIds.filter((userId) => !validUserIds.has(userId));
    const batchId = randomUUID();
    const payload = userIds.filter((userId) => validUserIds.has(userId)).map((userId) => ({
      userId,
      title: input.title,
      message: input.message,
      type: input.type ?? "info",
      category: input.category ?? "system",
      data: withBatchData(input.data, batchId),
      showAsBanner: input.showAsBanner ?? false,
      bannerExpiresAt: input.bannerExpiresAt ?? null,
    }));

    if (payload.length > 0) {
      await deps.db.insert(notification).values(payload);
    }

    return {
      sentCount: payload.length,
      skippedCount: invalidRecipientIds.length,
      invalidRecipientCount: invalidRecipientIds.length,
      invalidRecipientIds,
      batchId,
    };
  }

  return {
    createNotification,
    listForUser,
    getActiveBannerForUser,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    getAllNotifications,
    sendNotificationToAllUsers,
    sendNotificationToUsers,
  };
}
