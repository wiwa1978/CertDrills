import { createHash } from "node:crypto";

import { createPlatformDb, user } from "@platform/platform-db";

export function requireTestDatabaseUrl() {
  const value = process.env.TEST_DATABASE_URL?.trim();
  if (!value) {
    throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration tests");
  }

  const parsed = new URL(value);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("TEST_DATABASE_URL must use the postgres or postgresql protocol");
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!databaseName || !databaseName.toLowerCase().includes("test")) {
    throw new Error(`Refusing to use PostgreSQL database \"${databaseName || "<missing>"}\": its name must contain \"test\"`);
  }

  return value;
}

export function openTestDatabase() {
  return createPlatformDb({ connectionString: requireTestDatabaseUrl(), max: 4 });
}

export function rateLimitKey(rawKey: string) {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function fixtureToken(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}


type TestDatabase = ReturnType<typeof openTestDatabase>["db"];

export async function createFixtureUser(
  db: TestDatabase,
  label: string,
  overrides: Partial<typeof user.$inferInsert> = {},
) {
  const token = fixtureToken(label);
  const [record] = await db
    .insert(user)
    .values({
      name: `Integration ${label}`,
      email: `${token}@example.test`,
      emailVerified: true,
      role: "user",
      ...overrides,
    })
    .returning();
  if (!record) throw new Error(`Failed to create ${label} fixture user`);
  return record;
}