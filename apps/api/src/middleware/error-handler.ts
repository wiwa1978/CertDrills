import type { ErrorHandler } from "hono";

import type { AppEnv } from "../context";
import { env } from "../env";
import { errorCode as apiErrorCode } from "@platform/contracts/wire";

import { buildErrorCode, errorPayload } from "../lib/http";
import { logger } from "../observability/logger";

function serializeError(error: unknown) {
  if (!(error instanceof Error)) {
    return error;
  }

  return {
    name: error.name,
    message: error.message,
    ...(env.NODE_ENV === "development" ? { stack: error.stack } : {}),
  };
}

export const errorHandler: ErrorHandler<AppEnv> = (error, c) => {
  const requestId = c.get("requestId") ?? crypto.randomUUID();
  const errorCode = buildErrorCode(requestId);

  logger.error(
    {
      requestId,
      errorCode,
      method: c.req.method,
      path: c.req.path,
      error: serializeError(error),
    },
    "request.failed",
  );

  const response = c.json(
    env.NODE_ENV === "development"
      ? { ...errorPayload(apiErrorCode.internalServerError, error instanceof Error ? error.message : "Internal server error"), errorCode, requestId }
      : { ...errorPayload(apiErrorCode.internalServerError, "Internal server error"), errorCode, requestId },
    500,
  );

  response.headers.set("x-request-id", requestId);
  response.headers.set("x-error-code", errorCode);

  return response;
};
