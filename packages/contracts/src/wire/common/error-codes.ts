import { z } from "zod";

/**
 * Closed set of machine-readable error codes returned in `errorCode` of an
 * `errorResultSchema` envelope. Native and non-TS clients switch on these
 * values; never embed user-facing English strings in `errorCode`.
 *
 * Add new codes here before emitting them from the API. Keep generic HTTP/API
 * codes separate from domain-specific auth, billing, and provider codes.
 */
export const errorCode = {
  // generic HTTP/API errors
  badRequest: "BAD_REQUEST",
  validationFailed: "VALIDATION_FAILED",
  unauthorized: "UNAUTHORIZED",
  forbidden: "FORBIDDEN",
  notFound: "NOT_FOUND",
  conflict: "CONFLICT",
  payloadTooLarge: "PAYLOAD_TOO_LARGE",
  rateLimited: "RATE_LIMITED",
  internalServerError: "INTERNAL_SERVER_ERROR",
  // auth
  invalidCredentials: "INVALID_CREDENTIALS",
  emailNotVerified: "EMAIL_NOT_VERIFIED",
  twoFactorRequired: "TWO_FACTOR_REQUIRED",
  accountBanned: "ACCOUNT_BANNED",
  invalidRefreshToken: "INVALID_REFRESH_TOKEN",
  refreshTokenReused: "REFRESH_TOKEN_REUSED",
  // payments
  webhookSignatureMissing: "WEBHOOK_SIGNATURE_MISSING",
  webhookSignatureInvalid: "WEBHOOK_SIGNATURE_INVALID",
  webhookTimestampOutOfWindow: "WEBHOOK_TIMESTAMP_OUT_OF_WINDOW",
  webhookUserMismatch: "WEBHOOK_USER_MISMATCH",
} as const;

export type ErrorCode = (typeof errorCode)[keyof typeof errorCode];

export const errorCodeSchema = z.enum(
  Object.values(errorCode) as [ErrorCode, ...ErrorCode[]],
);
