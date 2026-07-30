import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, isNull } from "drizzle-orm";

import { apiKeys, type ApiKeyScope } from "@platform/platform-db";

type ApiKeysServiceDeps = {
  db: any;
};

export const apiKeyScopes = ["read:profile", "read:billing", "read:credits"] as const satisfies readonly ApiKeyScope[];

function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

function createPlaintextApiKey() {
  return `sk_${randomBytes(32).toString("base64url")}`;
}

function publicKey(row: any) {
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
    if (!plaintextKey.startsWith("sk_")) return null;
    const [row] = await deps.db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, hashApiKey(plaintextKey)), isNull(apiKeys.revokedAt)))
      .limit(1);

    if (!row) return null;
    if (row.expiresAt && row.expiresAt <= new Date()) return null;

    await deps.db.update(apiKeys).set({ lastUsedAt: new Date(), updatedAt: new Date() }).where(eq(apiKeys.id, row.id));
    return { userId: row.userId, scopes: row.scopes as ApiKeyScope[] };
  }

  return { list, create, revoke, authenticate };
}
