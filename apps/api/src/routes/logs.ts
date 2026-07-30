import { Hono } from "hono";
import type { Context } from "hono";

import { clientLogSchema } from "@platform/contracts";

import type { AppEnv } from "../context";
import { fail, validationError } from "../lib/http";
import { logger } from "../observability/logger";
import { redactLogValue, redactString } from "../observability/redaction";

const MAX_CLIENT_LOG_BYTES = 4 * 1024;

function getClientIp(c: Context<AppEnv>) {
  const forwardedFor = c.req.header("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return c.req.header("x-real-ip") ?? "unknown";
}

export function createLogsRouter() {
  const router = new Hono<AppEnv>();

  router.post("/logs/client", async (c) => {
    const ip = getClientIp(c);

    const contentLength = Number(c.req.header("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_CLIENT_LOG_BYTES) {
      return fail(c, "Log payload too large", 413, { errorCode: "PAYLOAD_TOO_LARGE" });
    }

    const body = await c.req.text();
    if (body.length > MAX_CLIENT_LOG_BYTES) {
      return fail(c, "Log payload too large", 413, { errorCode: "PAYLOAD_TOO_LARGE" });
    }

    let parsedJson: unknown = null;
    try {
      parsedJson = body ? JSON.parse(body) : null;
    } catch {
      parsedJson = null;
    }

    const parsed = clientLogSchema.safeParse(parsedJson);

    if (!parsed.success) {
      return validationError(c, "Invalid log payload");
    }

    const payload = parsed.data;
    const requestId = c.get("requestId");
    const message = redactString(payload.message);
    const context = redactLogValue(payload.context);
    const url = payload.url ? redactString(payload.url) : undefined;
    const userAgent = payload.userAgent ? redactString(payload.userAgent) : undefined;
    const logRecord = {
      requestId,
      source: "web",
      ip,
      url,
      userAgent,
      timestamp: payload.timestamp,
      context,
    };

    if (payload.level === "error") {
      logger.error(logRecord, message);
    } else if (payload.level === "warn") {
      logger.warn(logRecord, message);
    } else if (payload.level === "info") {
      logger.info(logRecord, message);
    } else {
      logger.debug(logRecord, message);
    }

    return c.json({ success: true, data: { accepted: true } });
  });

  return router;
}
