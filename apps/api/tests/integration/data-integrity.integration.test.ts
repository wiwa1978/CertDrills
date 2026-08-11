import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { apiKeys, transactionOrderItems, transactionOrders, user } from "@platform/platform-db";

import { createAdminService } from "../../src/modules/admin/service";
import { createApiKeysService } from "../../src/modules/api-keys/service";
import { createFixtureUser, fixtureToken, openTestDatabase } from "../support/database";

let database: ReturnType<typeof openTestDatabase>;
const fixtureUserIds = new Set<string>();

async function fixtureUser(label: string) {
  const record = await createFixtureUser(database.db, label);
  fixtureUserIds.add(record.id);
  return record;
}

describe("PostgreSQL data integrity", () => {
  beforeAll(() => {
    database = openTestDatabase();
  });

  afterEach(async () => {
    for (const userId of fixtureUserIds) {
      await database.db.delete(user).where(eq(user.id, userId));
    }
    fixtureUserIds.clear();
  });

  afterAll(async () => {
    await database.sql.end();
  });

  it("enforces transaction order and line-item invariants in the database", async () => {
    const owner = await fixtureUser("constraint-owner");
    const baseOrder = {
      userId: owner.id,
      currency: "EUR",
      subtotalAmount: 800,
      taxAmount: 200,
      totalAmount: 1000,
      paymentProvider: "dodo",
    };

    await expect(database.db.insert(transactionOrders).values({
      ...baseOrder,
      subtotalAmount: -1,
      taxAmount: 0,
      totalAmount: -1,
      checkoutReferenceId: fixtureToken("negative-order"),
    })).rejects.toThrow();

    await expect(database.db.insert(transactionOrders).values({
      ...baseOrder,
      totalAmount: 999,
      checkoutReferenceId: fixtureToken("inconsistent-order"),
    })).rejects.toThrow();

    await expect(database.db.insert(transactionOrders).values({
      ...baseOrder,
      status: "not-a-real-status" as never,
      checkoutReferenceId: fixtureToken("invalid-status-order"),
    })).rejects.toThrow();

    const [validOrder] = await database.db.insert(transactionOrders).values({
      ...baseOrder,
      status: "paid",
      checkoutReferenceId: fixtureToken("valid-order"),
    }).returning({ id: transactionOrders.id });
    if (!validOrder) throw new Error("Failed to create valid order fixture");

    await expect(database.db.insert(transactionOrderItems).values({
      orderId: validOrder.id,
      productKey: "starterContent",
      quantity: 0,
      unitPrice: 1000,
      totalAmount: 0,
      currency: "EUR",
      providerProductId: "provider-basic",
    })).rejects.toThrow();

    await expect(database.db.insert(transactionOrderItems).values({
      orderId: validOrder.id,
      productKey: "starterContent",
      quantity: 2,
      unitPrice: 500,
      totalAmount: 999,
      currency: "EUR",
      providerProductId: "provider-basic",
    })).rejects.toThrow();
  });

  it("returns finite numeric dashboard statistics from PostgreSQL", async () => {
    await fixtureUser("admin-statistics");
    const stats = await createAdminService({ db: database.db, adminSecret: "integration-secret" }).getDashboardStats();

    expect(stats.totalUsers).toBeGreaterThanOrEqual(1);
    expect(Object.values(stats)).not.toHaveLength(0);
    for (const value of Object.values(stats)) {
      expect(typeof value).toBe("number");
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("creates, authenticates, expires, lists, and revokes API keys", async () => {
    const owner = await fixtureUser("api-key-owner");
    const service = createApiKeysService({ db: database.db });

    const created = await service.create({
      userId: owner.id,
      name: "Integration key",
      scopes: ["read:profile", "read:billing"],
    });
    expect(created.plaintextKey).toMatch(/^sk_/);
    await expect(service.authenticate(created.plaintextKey)).resolves.toEqual({
      userId: owner.id,
      scopes: ["read:profile", "read:billing"],
    });
    await expect(service.authenticate("sk_invalid")).resolves.toBeNull();

    const listed = await service.list(owner.id);
    expect(listed).toEqual([expect.objectContaining({ id: created.apiKey.id, keyPrefix: created.apiKey.keyPrefix })]);
    expect(JSON.stringify(listed)).not.toContain(created.plaintextKey);

    await service.revoke(owner.id, created.apiKey.id);
    await expect(service.authenticate(created.plaintextKey)).resolves.toBeNull();

    const expired = await service.create({
      userId: owner.id,
      name: "Expired key",
      scopes: ["read:credits"],
      expiresAt: new Date(Date.now() - 1_000),
    });
    await expect(service.authenticate(expired.plaintextKey)).resolves.toBeNull();

    const rows = await database.db.select().from(apiKeys).where(eq(apiKeys.userId, owner.id));
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.keyHash !== created.plaintextKey && row.keyHash !== expired.plaintextKey)).toBe(true);
  });
});
