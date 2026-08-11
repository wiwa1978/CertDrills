import type { MiddlewareHandler } from "hono";

import { errorCode } from "@platform/contracts/wire";
import type { ModuleRouteGuardrail } from "@platform/module-contracts";

import type { AppEnv } from "../context";
import { env } from "../env";

export type RateLimitRule = {
  windowMs: number;
  max: number;
};

type RouteGuardrail = {
  method: string;
  pattern: RegExp;
  maxBodyBytes?: number;
  rateLimit?: RateLimitRule;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export type RateLimitStore = {
  consume: (key: string, rule: RateLimitRule) => Promise<RateLimitResult>;
};

type RequestGuardrailsOptions = {
  rateLimitStore: RateLimitStore;
  trustProxy: boolean;
  trustedProxyHops?: number;
  additionalGuardrails?: readonly ModuleRouteGuardrail[];
};

const KIB = 1024;
const DEFAULT_JSON_BODY_BYTES = 64 * KIB;
const DEFAULT_WEBHOOK_BODY_BYTES = 256 * KIB;
const JSON_BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);
const webhookBodyRoutes = [
  /^\/payments\/webhooks\/[^/]+$/,
  /^\/auth\/dodopayments\/webhooks$/,
];
const jsonBodyRoutes = [
  /^\/auth\/sign-in\/email$/,
  /^\/auth\/mobile\/token$/,
  /^\/auth\/mobile\/refresh$/,
  /^\/auth\/mobile\/revoke$/,
  /^\/payments\/checkout$/,
  /^\/me\/capabilities\/[^/]+\/consume$/,
  /^\/me\/credits\/invoice$/,
  /^\/me\/subscription\/invoice$/,
  /^\/me\/vouchers\/redeem$/,
  /^\/me\/notifications\/[^/]+\/read$/,
  /^\/logs\/client$/,
  /^\/api\/inngest$/,
  /^\/admin\/verify-admin-secret$/,
  /^\/admin\/users\/set-role$/,
  /^\/admin\/users\/unban$/,
  /^\/admin\/users\/ban$/,
  /^\/admin\/users\/impersonate$/,
  /^\/admin\/users\/revoke-sessions$/,
  /^\/admin\/users\/set-password$/,
  /^\/admin\/users\/[^/]+\/credits\/adjust$/,
  /^\/admin\/billing\/credit-refunds$/,
  /^\/admin\/billing\/transaction-refunds$/,
  /^\/admin\/billing\/subscription-refunds$/,
  /^\/admin\/billing\/reconcile$/,
  /^\/admin\/discounts(?:\/.*)?$/,
  /^\/admin\/vouchers(?:\/.*)?$/,
  /^\/admin\/operations\/background-events\/[^/]+\/redrive$/,
  /^\/admin\/notifications\/send-all$/,
  /^\/admin\/notifications\/send-users$/,
  /^\/auth\/admin\/stop-impersonating$/,
  ...webhookBodyRoutes,
];

const routeGuardrails: RouteGuardrail[] = [
  { method: "POST", pattern: /^\/auth\/sign-in\/email$/, maxBodyBytes: 8 * KIB, rateLimit: { windowMs: 60_000, max: 20 } },
  { method: "POST", pattern: /^\/auth\/mobile\/token$/, maxBodyBytes: 8 * KIB, rateLimit: { windowMs: 60_000, max: 20 } },
  { method: "POST", pattern: /^\/auth\/mobile\/refresh$/, maxBodyBytes: 4 * KIB, rateLimit: { windowMs: 60_000, max: 60 } },
  { method: "POST", pattern: /^\/auth\/mobile\/revoke$/, maxBodyBytes: 4 * KIB, rateLimit: { windowMs: 60_000, max: 60 } },
  { method: "POST", pattern: /^\/payments\/checkout$/, maxBodyBytes: 8 * KIB, rateLimit: { windowMs: 60_000, max: 30 } },
  { method: "POST", pattern: /^\/payments\/webhooks\/[^/]+$/, maxBodyBytes: DEFAULT_WEBHOOK_BODY_BYTES },
  { method: "POST", pattern: /^\/auth\/dodopayments\/webhooks$/, maxBodyBytes: DEFAULT_WEBHOOK_BODY_BYTES },
  { method: "POST", pattern: /^\/api\/inngest$/, maxBodyBytes: 1024 * KIB },
  { method: "PUT", pattern: /^\/api\/inngest$/, maxBodyBytes: 1024 * KIB },
  { method: "POST", pattern: /^\/me\/capabilities\/[^/]+\/consume$/, maxBodyBytes: 4 * KIB, rateLimit: { windowMs: 60_000, max: 20 } },
  { method: "POST", pattern: /^\/me\/vouchers\/redeem$/, maxBodyBytes: 4 * KIB, rateLimit: { windowMs: 60_000, max: 20 } },
  { method: "POST", pattern: /^\/logs\/client$/, maxBodyBytes: 4 * KIB, rateLimit: { windowMs: 60_000, max: 30 } },
  { method: "POST", pattern: /^\/admin\/verify-admin-secret$/, maxBodyBytes: 2 * KIB, rateLimit: { windowMs: 60_000, max: 5 } },
  { method: "POST", pattern: /^\/admin\/users\/ban$/, maxBodyBytes: 4 * KIB, rateLimit: { windowMs: 60_000, max: 5 } },
  { method: "POST", pattern: /^\/admin\/users\/set-password$/, maxBodyBytes: 4 * KIB, rateLimit: { windowMs: 60_000, max: 10 } },
  { method: "POST", pattern: /^\/admin\/users\/impersonate$/, maxBodyBytes: 4 * KIB, rateLimit: { windowMs: 60_000, max: 10 } },
  { method: "POST", pattern: /^\/admin\/billing\/credit-refunds$/, maxBodyBytes: 8 * KIB, rateLimit: { windowMs: 60_000, max: 10 } },
  { method: "POST", pattern: /^\/admin\/billing\/transaction-refunds$/, maxBodyBytes: 8 * KIB, rateLimit: { windowMs: 60_000, max: 10 } },
  { method: "POST", pattern: /^\/admin\/operations\/background-events\/[^/]+\/redrive$/, maxBodyBytes: 2 * KIB, rateLimit: { windowMs: 60_000, max: 10 } },
  { method: "POST", pattern: /^\/admin\/billing\/subscription-refunds$/, maxBodyBytes: 8 * KIB, rateLimit: { windowMs: 60_000, max: 10 } },
];

const buckets = new Map<string, { count: number; resetAt: number }>();

export function resolveClientIdentity(headers: Headers, trustProxy: boolean, trustedProxyHops = 1) {
  if (!trustProxy) return "direct-client";

  const cloudflareIp = headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return cloudflareIp;

  const forwardedChain = headers.get("x-forwarded-for")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (forwardedChain?.length) {
    return forwardedChain[Math.max(0, forwardedChain.length - trustedProxyHops)] ?? "unknown";
  }

  return headers.get("x-real-ip")?.trim() || "unknown";
}

function findGuardrail(method: string, path: string, additionalGuardrails: readonly ModuleRouteGuardrail[]) {
  return [...additionalGuardrails, ...routeGuardrails]
    .find((guardrail) => guardrail.method === method
      && ("path" in guardrail ? guardrail.path : guardrail.pattern).test(path));
}

function guardrailPath(path: string) {
  if (path === "/admin-auth" || path.startsWith("/admin-auth/")) return path.replace("/admin-auth", "/auth");
  if (path === "/admin/me" || path.startsWith("/admin/me/")) return path.replace("/admin/me", "/me");
  if (path === "/admin/payments" || path.startsWith("/admin/payments/")) return path.replace("/admin/payments", "/payments");
  return path;
}

function expectsJsonBody(method: string, path: string) {
  return JSON_BODY_METHODS.has(method) && jsonBodyRoutes.some((pattern) => pattern.test(path));
}

function isWebhookPath(path: string) {
  return webhookBodyRoutes.some((pattern) => pattern.test(path));
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

export function createRequestGuardrails(options: RequestGuardrailsOptions): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const method = c.req.method.toUpperCase();
    const contentType = c.req.header("content-type") ?? "";
    const lookupPath = guardrailPath(c.req.path);
    const guardrail = findGuardrail(method, lookupPath, options.additionalGuardrails ?? []);
    const maxBodyBytes = guardrail?.maxBodyBytes ?? (JSON_BODY_METHODS.has(method) && contentType.includes("application/json") ? DEFAULT_JSON_BODY_BYTES : undefined);

    if (expectsJsonBody(method, lookupPath)) {
      const hasJsonBody = contentType.includes("application/json");

      if (!isWebhookPath(lookupPath) && !hasJsonBody) {
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
      const identity = resolveClientIdentity(c.req.raw.headers, options.trustProxy, options.trustedProxyHops);
      const key = `${method}:${c.req.path}:${identity}`;
      const rateLimit = await options.rateLimitStore.consume(key, guardrail.rateLimit);
      c.header("x-ratelimit-remaining", String(rateLimit.remaining));

      if (!rateLimit.allowed) {
        return rateLimited(c, rateLimit.retryAfterSeconds);
      }
    }

    await next();
  };
}

const memoryRateLimitStore: RateLimitStore = {
  async consume(key, rule) {
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
      return { allowed: true, remaining: rule.max - 1, retryAfterSeconds: Math.ceil(rule.windowMs / 1000) };
    }

    bucket.count += 1;
    return {
      allowed: bucket.count <= rule.max,
      remaining: Math.max(0, rule.max - bucket.count),
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  },
};

export const requestGuardrails = createRequestGuardrails({
  rateLimitStore: memoryRateLimitStore,
  trustProxy: env.TRUST_PROXY,
  trustedProxyHops: env.TRUSTED_PROXY_HOPS,
});

export function clearRequestGuardrailStateForTests() {
  buckets.clear();
}
