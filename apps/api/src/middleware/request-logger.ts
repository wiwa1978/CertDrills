import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "../context";
import { logger } from "../observability/logger";

export const requestLogger: MiddlewareHandler<AppEnv> = async (c, next) => {
  const start = Date.now();

  await next();

  const requestId = c.get("requestId");
  if (requestId) {
    c.header("x-request-id", requestId);
  }

  logger.info(
    {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Date.now() - start,
    },
    "request.completed",
  );
};
