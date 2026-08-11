import { defineConfig } from "drizzle-kit";
import { existsSync, readFileSync } from "node:fs";

function readApiDatabaseUrl() {
  const envPath = "./apps/api/.env";

  if (!existsSync(envPath)) {
    return undefined;
  }

  const match = readFileSync(envPath, "utf8").match(/^DATABASE_URL=(.*)$/m);
  return match?.[1]?.trim().replace(/^['"]|['"]$/g, "");
}

const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
const databaseUrl = process.env.DRIZZLE_REQUIRE_MIGRATION_DATABASE_URL === "1"
  ? migrationDatabaseUrl
  : process.env.DATABASE_URL ?? migrationDatabaseUrl ?? readApiDatabaseUrl();

if (process.env.DRIZZLE_REQUIRE_MIGRATION_DATABASE_URL === "1" && !migrationDatabaseUrl) {
  throw new Error("MIGRATION_DATABASE_URL is required for database migration commands.");
}

if (process.env.DRIZZLE_REQUIRE_DATABASE_URL === "1" && !databaseUrl) {
  throw new Error("DATABASE_URL or MIGRATION_DATABASE_URL is required for this database command.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./packages/platform-db/src/schema/index.ts",
  out: "./packages/platform-db/drizzle",
  dbCredentials: {
    url: databaseUrl ?? "postgres://postgres:postgres@localhost:5432/platform",
  },
  migrations: {
    table: "__drizzle_migrations",
    schema: "public",
  },
  strict: true,
  verbose: true,
});
