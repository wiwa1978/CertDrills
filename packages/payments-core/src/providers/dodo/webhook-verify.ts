import { createHmac, timingSafeEqual } from "node:crypto";

import type { WebhookVerifyResult } from "../../types";

export type WebhookVerifyFailureReason =
  | "missing_header"
  | "missing_secret"
  | "malformed_header"
  | "timestamp_out_of_window"
  | "signature_mismatch";

export type { WebhookVerifyResult };

/** Default tolerance window: ±5 minutes either side of the signed timestamp. */
export const DODO_WEBHOOK_DEFAULT_TOLERANCE_SECONDS = 300;

function secureEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

function parseSignatureHeader(signatureHeader: string) {
  const parts = signatureHeader.split(",").map((item) => item.trim());
  const map = new Map<string, string>();

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key && value) {
      map.set(key, value);
    }
  }

  return {
    timestamp: map.get("t") ?? null,
    v1: map.get("v1") ?? null,
  };
}

export type VerifyOptions = {
  /** Tolerance for the signed timestamp drift, in seconds. */
  toleranceSeconds?: number;
  /** Override clock — for tests. */
  now?: () => Date;
};

/**
 * Verify a Dodo webhook signature.
 *
 * Returns a discriminated result rather than a raw boolean so callers can emit
 * stable error codes and structured logs without re-parsing the failure mode.
 *
 * Security model:
 * - Header MUST be `t=<unix-seconds>,v1=<hex-hmac>`. Malformed headers are
 *   rejected — there is no plain-body fallback because that would permit
 *   indefinite replay of any captured payload.
 * - Signed payload is `${t}.${rawBody}` exactly as Dodo signs it; we never
 *   parse the JSON before verifying.
 * - HMAC compare uses {@link timingSafeEqual} to prevent leakage via timing
 *   side-channels.
 * - The timestamp is checked against a tolerance window (default ±5 min) to
 *   block replay of historical payloads that match a leaked signature.
 */
export function verifyDodoWebhookSignatureDetailed(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined,
  options: VerifyOptions = {},
): WebhookVerifyResult {
  if (!secret) {
    return { ok: false, reason: "missing_secret" };
  }

  if (!signatureHeader) {
    return { ok: false, reason: "missing_header" };
  }

  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed.timestamp || !parsed.v1) {
    return { ok: false, reason: "malformed_header" };
  }

  if (!/^\d+$/.test(parsed.timestamp)) {
    return { ok: false, reason: "malformed_header" };
  }

  const timestampSeconds = Number.parseInt(parsed.timestamp, 10);
  if (!Number.isFinite(timestampSeconds)) {
    return { ok: false, reason: "malformed_header" };
  }

  const tolerance = options.toleranceSeconds ?? DODO_WEBHOOK_DEFAULT_TOLERANCE_SECONDS;
  const nowSeconds = Math.floor((options.now?.() ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > tolerance) {
    return { ok: false, reason: "timestamp_out_of_window" };
  }

  const signedPayload = `${parsed.timestamp}.${rawBody}`;
  const expectedHex = createHmac("sha256", secret).update(signedPayload).digest("hex");
  if (!secureEqual(expectedHex, parsed.v1)) {
    return { ok: false, reason: "signature_mismatch" };
  }

  return { ok: true };
}

/**
 * @deprecated Use {@link verifyDodoWebhookSignatureDetailed} for richer error
 * reporting. Retained for backward compatibility with consumers that only need
 * a boolean.
 */
export async function verifyDodoWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret?: string,
  options?: VerifyOptions,
) {
  const result = verifyDodoWebhookSignatureDetailed(
    rawBody,
    signatureHeader,
    secret,
    options,
  );
  return result.ok;
}
