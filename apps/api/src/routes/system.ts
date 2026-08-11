import { asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";

import { countriesQuerySchema } from "@platform/contracts/wire";
import { country } from "@platform/platform-db";
import type { ModuleHealthCheck } from "@platform/module-contracts";

import type { AppEnv } from "../context";
import type { PlatformServices } from "../bootstrap";
import { ok, parseQuery, validationError } from "../lib/http";

export function createSystemRouter(services: PlatformServices, healthChecks: readonly ModuleHealthCheck[] = []) {
  const router = new Hono<AppEnv>();

  router.get("/health", (c) => {
    return ok(c, { status: "ok" });
  });

  router.get("/ready", async (c) => {
    try {
      await services.db.execute(sql`select 1`);
      const checks = await Promise.all(healthChecks.map(async (healthCheck) => {
        try {
          return { id: healthCheck.id, required: healthCheck.required, ...await healthCheck.check() };
        } catch (error) {
          return {
            id: healthCheck.id,
            required: healthCheck.required,
            status: "not_ready" as const,
            detail: error instanceof Error ? error.message : "Health check failed",
          };
        }
      }));
      const unavailableRequiredCheck = checks.some((check) => check.required && check.status !== "ready");
      if (unavailableRequiredCheck) {
        return c.json({ success: false, status: "not_ready", checks }, 503);
      }
      return ok(c, { status: "ready", checks });
    } catch {
      return c.json({ success: false, status: "not_ready" }, 503);
    }
  });

  router.get("/countries", async (c) => {
    const parsedQuery = parseQuery(countriesQuerySchema, {
      lang: c.req.query("lang"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid countries query");
    }

    const localizedCountries = await services.db
      .select({
        id: country.id,
        name: country.name,
        code: country.code,
        language: country.language,
      })
      .from(country)
      .where(eq(country.language, parsedQuery.data.lang))
      .orderBy(asc(country.name));

    if (localizedCountries.length > 0) {
      return ok(c, localizedCountries);
    }

    const fallbackCountries = await services.db
      .select({
        id: country.id,
        name: country.name,
        code: country.code,
        language: country.language,
      })
      .from(country)
      .where(eq(country.language, "en"))
      .orderBy(asc(country.name));

    return ok(c, fallbackCountries);
  });

  return router;
}
