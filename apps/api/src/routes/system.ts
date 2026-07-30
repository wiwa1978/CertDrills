import { asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";

import { countriesQuerySchema } from "@platform/contracts/wire";
import { country } from "@platform/platform-db";

import type { AppEnv } from "../context";
import { bootstrap } from "../bootstrap";
import { ok, parseQuery, validationError } from "../lib/http";

export function createSystemRouter() {
  const router = new Hono<AppEnv>();

  router.get("/health", (c) => {
    return ok(c, { status: "ok" });
  });

  router.get("/ready", async (c) => {
    try {
      await bootstrap.db.execute(sql`select 1`);
      return ok(c, { status: "ready" });
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

    const localizedCountries = await bootstrap.db
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

    const fallbackCountries = await bootstrap.db
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
