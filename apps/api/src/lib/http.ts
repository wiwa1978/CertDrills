import { z } from "zod";

import { errorCode, type ErrorCode } from "@platform/contracts/wire";

type JsonContext = {
  get: (key: "requestId") => string | undefined;
  json: (body: unknown, status?: number) => Response;
};

export function validationError(c: JsonContext, message: string, details?: unknown) {
  return fail(c, message, 400, { errorCode: errorCode.validationFailed, ...(details !== undefined ? { details } : {}) });
}
// Keep validation responses bounded even when an attacker sends a very large invalid payload.
export const MAX_VALIDATION_DETAILS = 20;
export const TRUNCATED_VALIDATION_DETAILS_MESSAGE = "Additional validation errors were omitted.";
export const UNKNOWN_FIELD_VALIDATION_MESSAGE = "Unknown field.";

const ROOT_VALIDATION_PATH = "body";

export type ValidationDetail = {
  path: string;
  message: string;
  code: string;
};

export function validationIssuePath(path: ReadonlyArray<PropertyKey>) {
  return path.map((item) => String(item)).join(".") || ROOT_VALIDATION_PATH;
}

export function boundedValidationDetails(
  error: z.ZodError,
  options: {
    formatMessage?: (issue: z.core.$ZodIssue, path: string) => string;
    limit?: number;
  } = {},
): ValidationDetail[] {
  const limit = options.limit ?? MAX_VALIDATION_DETAILS;
  const formatMessage = options.formatMessage ?? ((issue: z.core.$ZodIssue) => issue.message);
  const details: ValidationDetail[] = [];
  let truncated = false;

  const add = (path: string, message: string, code: string) => {
    if (details.length >= limit) {
      truncated = true;
      return false;
    }
    details.push({ path, message, code });
    return true;
  };

  const addIssue = (issue: z.core.$ZodIssue) => {
    if (issue.code === "unrecognized_keys") {
      const keys = "keys" in issue && Array.isArray(issue.keys) ? issue.keys : [];
      for (const key of keys) {
        if (!add(validationIssuePath([...issue.path, key]), UNKNOWN_FIELD_VALIDATION_MESSAGE, issue.code)) return false;
      }
      return true;
    }

    const path = validationIssuePath(issue.path);
    return add(path, formatMessage(issue, path), issue.code);
  };

  for (const issue of error.issues) {
    if (!addIssue(issue)) break;
  }

  if (truncated) {
    details.push({ path: ROOT_VALIDATION_PATH, message: TRUNCATED_VALIDATION_DETAILS_MESSAGE, code: "custom" });
  }
  return details;
}


export function parseJsonBody<T>(schema: z.ZodSchema<T>, body: unknown) {
  return schema.safeParse(body);
}

export function parseQuery<T>(schema: z.ZodSchema<T>, query: Record<string, string | undefined>) {
  return schema.safeParse(query);
}

export function parseParams<T>(schema: z.ZodSchema<T>, params: Record<string, string>) {
  return schema.safeParse(params);
}

export function buildErrorCode(requestId: string) {
  return `API-${requestId}`;
}

export function errorPayload(code: string, message: string, details?: unknown) {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
}

export function schemaFromZod(schema: z.ZodTypeAny) {
  return z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" });
}

export function ok<T>(c: JsonContext, data: T, status = 200) {
  return c.json({ success: true, data }, status);
}

export function fail(
  c: JsonContext,
  error: string,
  status = 400,
  extra?: Record<string, unknown> & { errorCode?: ErrorCode },
) {
  const requestId = c.get("requestId");
  const code = extra?.errorCode ?? errorCode.badRequest;
  const { errorCode: _errorCode, details, ...rest } = extra ?? {};
  const response = c.json({ ...errorPayload(code, error, details), ...rest, ...(requestId ? { requestId } : {}) }, status);

  if (requestId) {
    response.headers.set("x-request-id", requestId);
  }

  if (extra?.errorCode) {
    response.headers.set("x-error-code", extra.errorCode);
  }

  return response;
}

export function badRequest(c: JsonContext, error: string, extra?: Record<string, unknown>) {
  return fail(c, error, 400, { ...(extra ?? {}), errorCode: errorCode.badRequest });
}

export function unauthorized(c: JsonContext, error = "Unauthorized", extra?: Record<string, unknown>) {
  return fail(c, error, 401, { ...(extra ?? {}), errorCode: errorCode.unauthorized });
}

export function forbidden(c: JsonContext, error = "Forbidden", extra?: Record<string, unknown>) {
  return fail(c, error, 403, { ...(extra ?? {}), errorCode: errorCode.forbidden });
}

export function notFound(c: JsonContext, error = "Not found", extra?: Record<string, unknown>) {
  return fail(c, error, 404, { ...(extra ?? {}), errorCode: errorCode.notFound });
}

export function badGateway(c: JsonContext, error = "Bad gateway", extra?: Record<string, unknown>) {
  return fail(c, error, 502, { ...(extra ?? {}), errorCode: errorCode.badGateway });
}

export function serverError(c: JsonContext, error = "Internal server error", extra?: Record<string, unknown>) {
  return fail(c, error, 500, { ...(extra ?? {}), errorCode: errorCode.internalServerError });
}
