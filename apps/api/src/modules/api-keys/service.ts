import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, gt, isNull, lt, or } from "drizzle-orm";

import { apiKeys, createPlatformDb, type ApiKeyScope } from "@platform/platform-db";

type PlatformDb = ReturnType<typeof createPlatformDb>["db"];

type ApiKeysServiceDeps = {
  db: PlatformDb;
};

export const apiKeyScopes = ["read:profile", "read:billing", "read:credits"] as const satisfies readonly ApiKeyScope[];

function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

function createPlaintextApiKey() {
  return `sk_${randomBytes(32).toString("base64url")}`;
}

function publicKey(row: typeof apiKeys.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    scopes: row.scopes,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createApiKeysService(deps: ApiKeysServiceDeps) {
  async function list(userId: string) {
    const rows = await deps.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId))
      .orderBy(desc(apiKeys.createdAt))
      .limit(50);

    return rows.map(publicKey);
  }

  async function create(input: { userId: string; name: string; scopes: ApiKeyScope[]; expiresAt?: Date | null }) {
    const plaintextKey = createPlaintextApiKey();
    const [row] = await deps.db
      .insert(apiKeys)
      .values({
        userId: input.userId,
        name: input.name,
        keyPrefix: plaintextKey.slice(0, 10),
        keyHash: hashApiKey(plaintextKey),
        scopes: input.scopes,
        expiresAt: input.expiresAt ?? null,
      })
      .returning();

    if (!row) throw new Error("Failed to create API key");
    return { apiKey: publicKey(row), plaintextKey };
  }

  async function revoke(userId: string, keyId: string) {
    const [row] = await deps.db
      .update(apiKeys)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
      .returning();

    return row ? publicKey(row) : null;
  }

  async function authenticate(plaintextKey: string) {
    const now = new Date();
    const candidateHash = hashApiKey(plaintextKey);
    const [row] = await deps.db
      .select()
      .from(apiKeys)
      .where(and(
        eq(apiKeys.keyHash, candidateHash),
        isNull(apiKeys.revokedAt),
        or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now)),
      ))
      .limit(1);

    if (!plaintextKey.startsWith("sk_") || !row) return null;

    const throttleBefore = new Date(now.getTime() - 5 * 60_000);
    await deps.db
      .update(apiKeys)
      .set({ lastUsedAt: now, updatedAt: now })
      .where(and(eq(apiKeys.id, row.id), or(isNull(apiKeys.lastUsedAt), lt(apiKeys.lastUsedAt, throttleBefore))));

    return { userId: row.userId, scopes: row.scopes };
  }

  return { list, create, revoke, authenticate };
}
