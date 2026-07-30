import type { MiddlewareHandler } from "hono";

import { errorCode } from "@platform/contracts/wire";

import type { AppEnv } from "../context";
import { env } from "../env";

type RateLimitRule = {
  windowMs: number;
  max: number;
};

type RouteGuardrail = {
  method: string;
  pattern: RegExp;
  maxBodyBytes?: number;
  rateLimit?: RateLimitRule;
};

const KIB = 1024;
const DEFAULT_JSON_BODY_BYTES = 64 * KIB;
const DEFAULT_WEBHOOK_BODY_BYTES = 256 * KIB;
const JSON_BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);
const jsonBodyRoutes = [
  /^\/auth\/sign-in\/email$/,
  /^\/auth\/mobile\/token$/,
  /^\/auth\/mobile\/refresh$/,
  /^\/auth\/mobile\/revoke$/,
  /^\/payments\/checkout$/,
  /^\/me\/credits\/consume$/,
  /^\/me\/credits\/invoice$/,
  /^\/me\/subscription\/invoice$/,
  /^\/me\/vouchers\/redeem$/,
  /^\/me\/notifications\/[^/]+\/read$/,
  /^\/logs\/client$/,
  /^\/admin\/verify-admin-secret$/,
  /^\/admin\/users\/set-role$/,
  /^\/admin\/users\/unban$/,
  /^\/admin\/users\/ban$/,
  /^\/admin\/users\/impersonate$/,
  /^\/admin\/users\/revoke-sessions$/,
  /^\/admin\/users\/set-password$/,
  /^\/admin\/users\/[^/]+\/credits\/adjust$/,
  /^\/admin\/billing\/credit-refunds$/,
  /^\/admin\/billing\/subscription-refunds$/,
  /^\/admin\/billing\/reconcile$/,
  /^\/admin\/discounts(?:\/.*)?$/,
  /^\/admin\/vouchers(?:\/.*)?$/,
  /^\/admin\/notifications\/send-all$/,
  /^\/admin\/notifications\/send-users$/,
  /^\/auth\/admin\/stop-impersonating$/,
];

const routeGuardrails: RouteGuardrail[] = [
  { method: "POST", pattern: /^\/auth\/sign-in\/email$/, maxBodyBytes: 8 * KIB, rateLimit: { windowMs: 60_000, max: 20 } },
  { method: "POST", pattern: /^\/auth\/mobile\/token$/, maxBodyBytes: 8 * KIB, rateLimit: { windowMs: 60_000, max: 20 } },
  { method: "POST", pattern: /^\/auth\/mobile\/refresh$/, maxBodyBytes: 4 * KIB, rateLimit: { windowMs: 60_000, max: 60 } },
  { method: "POST", pattern: /^\/auth\/mobile\/revoke$/, maxBodyBytes: 4 * KIB, rateLimit: { windowMs: 60_000, max: 60 } },
  { method: "POST", pattern: /^\/payments\/checkout$/, maxBodyBytes: 8 * KIB, rateLimit: { windowMs: 60_000, max: 30 } },
  { method: "POST", pattern: /^\/payments\/webhooks\/[^/]+$/, maxBodyBytes: DEFAULT_WEBHOOK_BODY_BYTES },
  { method: "POST", pattern: /^\/me\/vouchers\/redeem$/, maxBodyBytes: 4 * KIB, rateLimit: { windowMs: 60_000, max: 20 } },
  { method: "POST", pattern: /^\/logs\/client$/, maxBodyBytes: 4 * KIB, rateLimit: { windowMs: 60_000, max: 30 } },
  { method: "POST", pattern: /^\/admin\/verify-admin-secret$/, maxBodyBytes: 2 * KIB, rateLimit: { windowMs: 60_000, max: 5 } },
  { method: "POST", pattern: /^\/admin\/users\/ban$/, maxBodyBytes: 4 * KIB, rateLimit: { windowMs: 60_000, max: 5 } },
  { method: "POST", pattern: /^\/admin\/users\/set-password$/, maxBodyBytes: 4 * KIB, rateLimit: { windowMs: 60_000, max: 10 } },
  { method: "POST", pattern: /^\/admin\/users\/impersonate$/, maxBodyBytes: 4 * KIB, rateLimit: { windowMs: 60_000, max: 10 } },
  { method: "POST", pattern: /^\/admin\/billing\/credit-refunds$/, maxBodyBytes: 8 * KIB, rateLimit: { windowMs: 60_000, max: 10 } },
  { method: "POST", pattern: /^\/admin\/billing\/subscription-refunds$/, maxBodyBytes: 8 * KIB, rateLimit: { windowMs: 60_000, max: 10 } },
];

const buckets = new Map<string, { count: number; resetAt: number }>();

function getClientIp(c: Parameters<MiddlewareHandler<AppEnv>>[0]) {
  if (env.TRUST_PROXY) {
    const forwardedFor = c.req.header("x-forwarded-for");
    if (forwardedFor) {
      return forwardedFor.split(",")[0]?.trim() || "unknown";
    }

    return c.req.header("x-real-ip") ?? "unknown";
  }

  const forwardedFor = c.req.header("x-forwarded-for");
  const realIp = c.req.header("x-real-ip");

  return c.req.header("cf-connecting-ip") ?? realIp ?? forwardedFor?.split(",")[0]?.trim() ?? "direct-client";
}

function findGuardrail(method: string, path: string) {
  return routeGuardrails.find((guardrail) => guardrail.method === method && guardrail.pattern.test(path));
}

function expectsJsonBody(method: string, path: string) {
  return JSON_BODY_METHODS.has(method) && jsonBodyRoutes.some((pattern) => pattern.test(path));
}

function checkRateLimit(key: string, rule: RateLimitRule) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, remaining: rule.max - 1, retryAfterSeconds: Math.ceil(rule.windowMs / 1000) };
  }

  if (bucket.count >= rule.max) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true, remaining: rule.max - bucket.count, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
}

function tooLarge(c: Parameters<MiddlewareHandler<AppEnv>>[0]) {
  return c.json(
    {
      success: false,
      error: {
        code: errorCode.payloadTooLarge,
        message: "Payload too large",
      },
    },
    413,
  );
}

function rateLimited(c: Parameters<MiddlewareHandler<AppEnv>>[0], retryAfterSeconds: number) {
  c.header("retry-after", String(retryAfterSeconds));
  return c.json(
    {
      success: false,
      error: {
        code: errorCode.rateLimited,
        message: "Too many requests",
      },
    },
    429,
  );
}

async function checkBodyLimit(request: Request, maxBodyBytes: number) {
  if (!request.body) {
    return false;
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      bytesRead += value.byteLength;
      if (bytesRead > maxBodyBytes) {
        return true;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(bytesRead) as Uint8Array<ArrayBuffer>;
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new Request(request, { body, duplex: "half" } as RequestInit & { duplex: "half" });
}

export const requestGuardrails: MiddlewareHandler<AppEnv> = async (c, next) => {
  const method = c.req.method.toUpperCase();
  const contentType = c.req.header("content-type") ?? "";
  const guardrail = findGuardrail(method, c.req.path);
  const maxBodyBytes = guardrail?.maxBodyBytes ?? (JSON_BODY_METHODS.has(method) && contentType.includes("application/json") ? DEFAULT_JSON_BODY_BYTES : undefined);

  if (expectsJsonBody(method, c.req.path)) {
    const isWebhook = /^\/payments\/webhooks\/[^/]+$/.test(c.req.path);
    const hasJsonBody = contentType.includes("application/json");

    if (!isWebhook && !hasJsonBody) {
      return c.json({ success: false, error: { code: errorCode.badRequest, message: "Unsupported content type" } }, 415);
    }
  }

  if (maxBodyBytes !== undefined && method !== "GET" && method !== "HEAD") {
    const contentLengthHeader = c.req.header("content-length");
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
        return tooLarge(c);
      }
    } else if (c.req.raw.body) {
      const checkedRequest = await checkBodyLimit(c.req.raw, maxBodyBytes);
      if (checkedRequest === true) {
        return tooLarge(c);
      }

      if (checkedRequest) {
        c.req.raw = checkedRequest;
      }
    }
  }

  if (guardrail?.rateLimit) {
    const key = `${method}:${c.req.path}:${getClientIp(c)}`;
    const rateLimit = checkRateLimit(key, guardrail.rateLimit);
    c.header("x-ratelimit-remaining", String(rateLimit.remaining));

    if (!rateLimit.allowed) {
      return rateLimited(c, rateLimit.retryAfterSeconds);
    }
  }

  await next();
};

export function clearRequestGuardrailStateForTests() {
  buckets.clear();
}
