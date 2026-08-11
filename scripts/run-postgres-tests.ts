import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { requireTestDatabaseUrl } from "../apps/api/tests/support/database";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mode = process.argv[2];
if (mode !== "integration" && mode !== "admin-system") {
  throw new Error("Usage: bun scripts/run-postgres-tests.ts <integration|admin-system>");
}

const testDatabaseUrl = requireTestDatabaseUrl();

async function run(args: string[], options: { cwd?: string; env?: Record<string, string | undefined> } = {}) {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: options.cwd ?? repositoryRoot,
      env: { ...process.env, ...options.env } as NodeJS.ProcessEnv,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (exitCode) => {
      if (exitCode === 0) {
        resolvePromise();
      } else {
        reject(new Error(`Command failed with exit code ${exitCode ?? "unknown"}: bun ${args.join(" ")}`));
      }
    });
  });
}

const databaseEnvironment = {
  DATABASE_URL: testDatabaseUrl,
  MIGRATION_DATABASE_URL: process.env.MIGRATION_DATABASE_URL ?? testDatabaseUrl,
  TEST_DATABASE_URL: testDatabaseUrl,
  DRIZZLE_REQUIRE_DATABASE_URL: "1",
};

await run(["run", "db:migrate"], { env: databaseEnvironment });

if (mode === "integration") {
  await run(["run", "--cwd", "apps/api", "test:integration"], { env: databaseEnvironment });
} else {
  const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "admin-e2e@example.test";
  const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "System-test-password-2026!";
  const userEmail = process.env.E2E_USER_EMAIL ?? "user-e2e@example.test";
  const userPassword = process.env.E2E_USER_PASSWORD ?? "System-test-user-password-2026!";
  const apiPort = process.env.E2E_API_PORT ?? "18787";
  const adminPort = process.env.E2E_ADMIN_PORT ?? "13101";
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const adminUrl = `http://127.0.0.1:${adminPort}`;
  const systemEnvironment = {
    ...databaseEnvironment,
    NODE_ENV: "test",
    PORT: apiPort,
    APP_URL: "http://127.0.0.1:13100",
    API_URL: apiUrl,
    ADMIN_APP_URL: adminUrl,
    NEXT_PUBLIC_APP_URL: "http://127.0.0.1:13100",
    NEXT_PUBLIC_API_URL: apiUrl,
    NEXT_PUBLIC_MAIN_APP_URL: "http://127.0.0.1:13100",
    NEXT_DIST_DIR: ".next-system",
    NEXT_PUBLIC_APP_NAME: "SingleTenant Hono System Test",
    BETTER_AUTH_ALLOWED_ORIGINS: `http://127.0.0.1:13100,${adminUrl},${apiUrl}`,
    ADMIN_ALLOWLIST: adminEmail,
    E2E_SYSTEM: "1",
    E2E_ADMIN_EMAIL: adminEmail,
    E2E_ADMIN_PASSWORD: adminPassword,
    E2E_USER_EMAIL: userEmail,
    E2E_USER_PASSWORD: userPassword,
    PLAYWRIGHT_API_URL: apiUrl,
    PLAYWRIGHT_BASE_URL: adminUrl,
    PLAYWRIGHT_PORT: adminPort,
  };

  await run(["run", "--cwd", "apps/api", "test:e2e:fixtures"], { env: systemEnvironment });
  try {
    await run(["run", "--cwd", "apps/admin", "test:e2e:system"], { env: systemEnvironment });
  } finally {
    await run(["run", "--cwd", "apps/api", "test:e2e:fixtures", "--", "--cleanup"], { env: systemEnvironment });
    await run(["run", "--cwd", "apps/api", "test:e2e:fixtures", "--", "--verify-clean"], { env: systemEnvironment });
  }
}
