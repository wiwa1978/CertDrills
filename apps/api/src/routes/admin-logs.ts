import type { Hono } from "hono";

import { logEntriesQuerySchema, logFilesQuerySchema } from "@platform/contracts";

import type { AppEnv } from "../context";
import { parseQuery, validationError } from "../lib/http";
import { logger } from "../observability/logger";

export function registerAdminLogRoutes(router: Hono<AppEnv>) {
  router.get("/logs/files", (c) => {
    const parsed = parseQuery(logFilesQuerySchema, { stream: c.req.query("stream") });
    if (!parsed.success) return validationError(c, "Invalid logs query");
    return c.json({ success: true, data: logger.listLogFiles(parsed.data.stream) });
  });

  router.get("/logs/entries", (c) => {
    const parsed = parseQuery(logEntriesQuerySchema, { stream: c.req.query("stream"), file: c.req.query("file"), limit: c.req.query("limit") });
    if (!parsed.success) return validationError(c, "Invalid log entries query");
    try {
      return c.json({ success: true, data: logger.readLogEntries(parsed.data) });
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid log file") return validationError(c, "Invalid log entries query");
      throw error;
    }
  });
}
