import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

import {
  account,
  backgroundEvents,
  emailDeliveries,
  session,
  user,
  userDataExportRequests,
} from "@platform/platform-db";

import { createEmailDeliveryService } from "../../src/modules/email/delivery";
import { createOutboxPublisher, insertOutboxEvent } from "../../src/modules/background/outbox";
import { createPrivacyService } from "../../src/modules/privacy/service";
import { createFixtureUser, fixtureToken, openTestDatabase } from "../support/database";

let database: ReturnType<typeof openTestDatabase>;
const fixtureUserIds = new Set<string>();
const backgroundEventIds = new Set<string>();
const emailRecipients = new Set<string>();

async function fixtureUser(label: string) {
  const record = await createFixtureUser(database.db, label);
  fixtureUserIds.add(record.id);
  return record;
}

describe("background processing PostgreSQL integration", () => {
  beforeAll(() => {
    database = openTestDatabase();
  });

  afterEach(async () => {
    const eventIds = [...backgroundEventIds];
    backgroundEventIds.clear();
    if (eventIds.length > 0) {
      await database.db.delete(backgroundEvents).where(inArray(backgroundEvents.id, eventIds));
    }

    const recipients = [...emailRecipients];
    emailRecipients.clear();
    if (recipients.length > 0) {
      await database.db.delete(emailDeliveries).where(inArray(emailDeliveries.to, recipients));
    }

    for (const userId of fixtureUserIds) {
      await database.db.delete(user).where(eq(user.id, userId));
    }
    fixtureUserIds.clear();
  });

  afterAll(async () => {
    await database.sql.end();
  });

  it("publishes an outbox event once across concurrent publishers", async () => {
    const eventId = crypto.randomUUID();
    backgroundEventIds.add(eventId);
    await insertOutboxEvent(database.db, {
      id: eventId,
      name: "platform/test.requested",
      data: { recordId: crypto.randomUUID() },
    });
    const send = vi.fn(async () => ({ ids: [eventId] }));
    const now = new Date("2026-08-09T12:00:00.000Z");
    const first = createOutboxPublisher({ db: database.db, send, publisherId: "publisher-a", now: () => now });
    const second = createOutboxPublisher({ db: database.db, send, publisherId: "publisher-b", now: () => now });

    const results = await Promise.all([first.publishById(eventId), second.publishById(eventId)]);

    expect(results.filter((result) => result.published)).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
    const stored = await database.db.query.backgroundEvents.findFirst({ where: eq(backgroundEvents.id, eventId) });
    expect(stored).toMatchObject({ status: "published", inngestEventId: eventId, lockedAt: null, lockedBy: null });
  });

  it("delivers an accepted email idempotently", async () => {
    const recipient = `${fixtureToken("email-delivery")}@example.test`;
    emailRecipients.add(recipient);
    const publishedIds: string[] = [];
    const provider = { send: vi.fn(async () => ({ success: true as const, data: { id: "message-1" } })) };
    const publisher = createOutboxPublisher({
      db: database.db,
      send: async (event) => {
        publishedIds.push(event.id);
        return { ids: [event.id] };
      },
    });
    const delivery = createEmailDeliveryService({ db: database.db, provider, publishOutbox: publisher.publishById });
    const accepted = await delivery.enqueue({ to: recipient, subject: "Integration", html: "<p>Integration</p>" });
    backgroundEventIds.add(accepted.outboxId);

    await expect(delivery.deliver(accepted.id)).resolves.toMatchObject({ delivered: true });
    await expect(delivery.deliver(accepted.id)).resolves.toMatchObject({ delivered: false });

    expect(publishedIds).toEqual([accepted.outboxId]);
    expect(provider.send).toHaveBeenCalledOnce();
    expect(provider.send).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: accepted.id }));
    const [stored] = await database.db.select().from(emailDeliveries).where(eq(emailDeliveries.id, accepted.id));
    expect(stored).toMatchObject({ status: "sent", attempts: 1, providerMessageId: "message-1" });
  });

  it("creates a private export, consumes its token once, and excludes auth secrets", async () => {
    const owner = await fixtureUser("privacy-owner");
    const accessToken = fixtureToken("access-token");
    const passwordHash = fixtureToken("password-hash");
    const sessionToken = fixtureToken("session-token");
    await database.db.insert(account).values({
      accountId: owner.id,
      providerId: "credential",
      userId: owner.id,
      accessToken,
      refreshToken: fixtureToken("refresh-token"),
      idToken: fixtureToken("id-token"),
      password: passwordHash,
    });
    await database.db.insert(session).values({
      token: sessionToken,
      userId: owner.id,
      expiresAt: new Date(Date.now() + 60_000),
      ipAddress: "127.0.0.1",
      userAgent: "integration-test",
    });

    let queued: { exportId: string; userId: string } | undefined;
    const storedObjects = new Map<string, string>();
    const storage = {
      put: vi.fn(async (key: string, contents: string) => { storedObjects.set(key, contents); }),
      get: vi.fn(async (key: string) => storedObjects.get(key) ?? null),
      delete: vi.fn(async (key: string) => { storedObjects.delete(key); }),
    };
    const privacy = createPrivacyService({
      db: database.db,
      now: () => new Date("2026-08-09T12:00:00.000Z"),
      storage,
      enqueueExport: async (_executor, input) => { queued = input; },
      exportProductData: async () => ({}),
    });
    const created = await privacy.createExport(owner.id);
    expect(created.ok).toBe(true);
    if (!created.ok || !created.data) throw new Error(created.error);
    expect(queued).toEqual({ exportId: created.data.id, userId: owner.id });
    await expect(privacy.generateExport(created.data.id, owner.id)).resolves.toEqual(
      expect.objectContaining({ ok: true }),
    );
    const [storedRequest] = await database.db
      .select()
      .from(userDataExportRequests)
      .where(eq(userDataExportRequests.id, created.data.id));
    expect(storedRequest?.storageKey).toBe(`privacy-exports/${created.data.id}.json`);
    expect(storage.put).toHaveBeenCalledWith(
      `privacy-exports/${created.data.id}.json`,
      expect.stringContaining(owner.email),
    );
    expect(storedObjects.size).toBe(1);

    const downloaded = await privacy.downloadExport(owner.id, created.data.id, created.data.downloadToken);
    expect(downloaded.ok).toBe(true);
    if (!downloaded.ok) throw new Error(downloaded.error);
    if (!downloaded.contents) throw new Error("Export contents are missing");
    expect(downloaded.contents).toContain(owner.email);
    expect(downloaded.contents).not.toContain(accessToken);
    expect(downloaded.contents).not.toContain(passwordHash);
    expect(downloaded.contents).not.toContain(sessionToken);
    expect(storage.get).toHaveBeenCalledWith(`privacy-exports/${created.data.id}.json`);
    expect(storage.delete).toHaveBeenCalledWith(`privacy-exports/${created.data.id}.json`);
    expect(storedObjects.size).toBe(0);

    await expect(privacy.downloadExport(owner.id, created.data.id, created.data.downloadToken))
      .resolves.toEqual({ ok: false, error: "EXPORT_NOT_FOUND" });
  });
});
