import { describe, expect, it, vi } from "vitest";

import { createNotificationsService } from "../../../src/modules/notifications/service";

describe("createNotificationsService", () => {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  // Verifies default notification properties are applied when optional fields are omitted.
  it("creates a notification with defaults", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "n1", type: "info" }]);
    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });

    const service = createNotificationsService({ db: { insert } as any });

    const created = await service.createNotification({
      userId: "u1",
      title: "Title",
      message: "Message",
      category: "system",
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "info",
        showAsBanner: false,
      }),
    );
    expect(created).toEqual({ id: "n1", type: "info" });
  });

  // Verifies broadcast notifications fan out once per existing user.
  it("sendNotificationToAllUsers fan-outs to all users", async () => {
    const service = createNotificationsService({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockResolvedValue([{ id: "u1" }, { id: "u2" }, { id: "u3" }]),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
      } as any,
    });

    const result = await service.sendNotificationToAllUsers({ title: "Hi", message: "Body" });
    expect(result).toEqual({
      sentCount: 3,
      skippedCount: 0,
      invalidRecipientCount: 0,
      invalidRecipientIds: [],
      batchId: expect.stringMatching(uuidPattern),
    });
  });

  // Verifies broadcast sends avoid oversized inserts and tag each row with shared batch metadata.
  it("sendNotificationToAllUsers inserts users in batches with notification batch metadata", async () => {
    const users = Array.from({ length: 1001 }, (_, index) => ({ id: `u${index + 1}` }));
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockReturnValue({ values });
    const transaction = vi.fn(async (callback) => callback({ insert }));
    const service = createNotificationsService({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockResolvedValue(users),
        }),
        insert: vi.fn(),
        transaction,
      } as any,
    });

    const result = await service.sendNotificationToAllUsers({
      title: "Hi",
      message: "Body",
      data: { source: "admin" },
    });

    expect(result).toEqual({
      sentCount: 1001,
      skippedCount: 0,
      invalidRecipientCount: 0,
      invalidRecipientIds: [],
      batchId: expect.stringMatching(uuidPattern),
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(3);
    expect(values).toHaveBeenCalledTimes(3);
    expect(values.mock.calls.map(([rows]) => rows)).toEqual([
      expect.arrayContaining([expect.objectContaining({ userId: "u1" })]),
      expect.arrayContaining([expect.objectContaining({ userId: "u501" })]),
      [expect.objectContaining({ userId: "u1001" })],
    ]);
    expect(values.mock.calls.map(([rows]) => rows).map((rows) => rows.length)).toEqual([500, 500, 1]);

    const insertedRows = values.mock.calls.flatMap(([rows]) => rows);
    const batchIds = new Set(insertedRows.map((row) => row.data.notificationBatchId));

    expect(batchIds.size).toBe(1);
    expect([...batchIds][0]).toMatch(uuidPattern);
    expect(result.batchId).toBe([...batchIds][0]);
    expect(insertedRows).toHaveLength(1001);
    expect(insertedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ data: expect.objectContaining({ source: "admin" }) }),
      ]),
    );
  });

  // Verifies targeted notifications avoid insert calls when no recipients are provided.
  it("sendNotificationToUsers handles empty input", async () => {
    const from = vi.fn().mockResolvedValue([]);
    const select = vi.fn().mockReturnValue({ from });
    const insert = vi.fn();
    const service = createNotificationsService({ db: { select, insert } as any });

    const result = await service.sendNotificationToUsers({
      userIds: [],
      title: "A",
      message: "B",
    });

    expect(result).toEqual({
      sentCount: 0,
      skippedCount: 0,
      invalidRecipientCount: 0,
      invalidRecipientIds: [],
      batchId: expect.stringMatching(uuidPattern),
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("listForUser strips internal batch metadata from notification data", async () => {
    const limit = vi.fn().mockResolvedValue([
      {
        id: "n1",
        data: {
          notificationBatchId: "11111111-1111-4111-8111-111111111111",
          translations: { title: "Hallo" },
          source: "admin",
        },
      },
      { id: "n2", data: null },
    ]);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const service = createNotificationsService({ db: { select } as any });

    const result = await service.listForUser("u1", 10);

    expect(result).toEqual([
      {
        id: "n1",
        data: {
          translations: { title: "Hallo" },
          source: "admin",
        },
      },
      { id: "n2", data: null },
    ]);
  });

  it("getActiveBannerForUser returns one unread active banner without internal batch metadata", async () => {
    const limit = vi.fn().mockResolvedValue([
      {
        id: "n1",
        title: "maintenance.title",
        data: {
          notificationBatchId: "11111111-1111-4111-8111-111111111111",
          window: "tonight",
        },
      },
    ]);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const service = createNotificationsService({ db: { select } as any });

    const result = await service.getActiveBannerForUser("u1");

    expect(where).toHaveBeenCalledTimes(1);
    expect(orderBy).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledWith(1);
    expect(result).toEqual({
      id: "n1",
      title: "maintenance.title",
      data: { window: "tonight" },
    });
  });

  // Verifies targeted notifications deduplicate recipients and report missing users without failing the request.
  it("sendNotificationToUsers inserts valid recipients and reports invalid recipients", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockReturnValue({ values });
    const where = vi.fn().mockResolvedValue([{ id: "u1" }, { id: "u2" }]);
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const service = createNotificationsService({ db: { select, insert } as any });

    const result = await service.sendNotificationToUsers({
      userIds: ["u1", "u1", "u2", "  u2  ", "missing"],
      title: "A",
      message: "B",
    });

    expect(result).toEqual({
      sentCount: 2,
      skippedCount: 1,
      invalidRecipientCount: 1,
      invalidRecipientIds: ["missing"],
      batchId: expect.stringMatching(uuidPattern),
    });
    expect(values).toHaveBeenCalledWith([
      expect.objectContaining({ userId: "u1" }),
      expect.objectContaining({ userId: "u2" }),
    ]);
  });

  // Verifies targeted sends preserve caller data and tag valid inserts with one shared batch ID.
  it("sendNotificationToUsers attaches notification batch metadata to valid inserted recipients", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockReturnValue({ values });
    const where = vi.fn().mockResolvedValue([{ id: "u1" }, { id: "u2" }]);
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const service = createNotificationsService({ db: { select, insert } as any });

    const result = await service.sendNotificationToUsers({
      userIds: ["u1", "missing", "u2"],
      title: "A",
      message: "B",
      data: { action: "review" },
    });

    expect(result).toEqual({
      sentCount: 2,
      skippedCount: 1,
      invalidRecipientCount: 1,
      invalidRecipientIds: ["missing"],
      batchId: expect.stringMatching(uuidPattern),
    });

    const [[insertedRows]] = values.mock.calls;
    const batchIds = new Set(insertedRows.map((row: { data: Record<string, unknown> }) => row.data.notificationBatchId));

    expect(batchIds.size).toBe(1);
    expect([...batchIds][0]).toMatch(uuidPattern);
    expect(result.batchId).toBe([...batchIds][0]);
    expect(insertedRows).toEqual([
      expect.objectContaining({
        userId: "u1",
        data: expect.objectContaining({ action: "review", notificationBatchId: [...batchIds][0] }),
      }),
      expect.objectContaining({
        userId: "u2",
        data: expect.objectContaining({ action: "review", notificationBatchId: [...batchIds][0] }),
      }),
    ]);
  });

  // Verifies unread count returns zero when no aggregate row exists.
  it("unreadCount defaults to 0 when no row returned", async () => {
    const service = createNotificationsService({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any,
    });

    await expect(service.unreadCount("u1")).resolves.toBe(0);
  });

  // Verifies admin notification listing returns the reduced response shape.
  it("getAllNotifications limits and redacts admin response shape", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: "n1" }]);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ orderBy });
    const select = vi.fn().mockReturnValue({ from });

    const service = createNotificationsService({ db: { select } as any });
    const result = await service.getAllNotifications(999);

    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.anything(),
        title: expect.anything(),
        createdAt: expect.anything(),
      }),
    );
    expect(limit).toHaveBeenCalledWith(100);
    expect(result).toEqual([{ id: "n1" }]);
  });
});
