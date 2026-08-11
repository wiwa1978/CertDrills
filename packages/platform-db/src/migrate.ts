import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;

if (!migrationDatabaseUrl) {
  throw new Error("MIGRATION_DATABASE_URL is required for database migrations.");
}

const client = postgres(migrationDatabaseUrl, { max: 1 });

try {
  await migrate(drizzle(client), {
    migrationsFolder: "./packages/platform-db/drizzle",
    migrationsSchema: "public",
    migrationsTable: "__drizzle_migrations",
  });
} catch (error) {
  const cause = error instanceof Error && "cause" in error ? error.cause : undefined;
  console.error("Database migration failed", {
    message: error instanceof Error ? error.message : String(error),
    cause: cause instanceof Error ? cause.message : undefined,
  });
  process.exitCode = 1;
} finally {
  await client.end();
}
