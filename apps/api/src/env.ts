import { z } from "zod";

import { applicationConfig } from "./config/application";
import { DODO_BRAND_ENV_BY_BILLING_MODE } from "./config/dodo-brands";

const emptyToUndefined = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  z.preprocess((value) => {
    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }

    return value;
  }, schema.optional());

const placeholderSecrets = new Set([
  "replace-with-strong-secret",
  "changeme",
  "change-me",
]);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3302),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  LOG_FILE_PATH: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  COOKIE_DOMAIN: emptyToUndefined(z.string()),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_ALLOWED_ORIGINS: z.string().optional(),
  ADMIN_ALLOWLIST: z.string().optional(),
  ADMIN_APP_URL: z.string().url().optional(),
  ADMIN_SECRET: z.string().optional(),
  ADMIN_PORTAL_TOTP_REQUIRED: z.string()
    .trim()
    .toLowerCase()
    .pipe(z.enum(["true", "false"]))
    .transform((value) => value === "true")
    .default(false),
  DODO_LIVE_MODE_APPROVED: z.string().optional(),
  TRUST_PROXY: z.string()
    .trim()
    .toLowerCase()
    .pipe(z.enum(["true", "false"]))
    .transform((value) => value === "true")
    .default(false),
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(1).max(10).default(1),
  PAYMENT_PROVIDER: z.enum(["dodo", "stripe"]).default("dodo"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  DODO_PAYMENTS_API_KEY: z.string().optional(),
  DODO_PAYMENTS_WEBHOOK_SECRET: z.string().optional(),
  DODO_PAYMENTS_ENVIRONMENT: z.enum(["test_mode", "live_mode"]).default("test_mode"),
  DODO_CREDITS_BRAND_ID: emptyToUndefined(z.string().trim().min(1)),
  DODO_SUBSCRIPTIONS_BRAND_ID: emptyToUndefined(z.string().trim().min(1)),
  DODO_TRANSACTIONS_BRAND_ID: emptyToUndefined(z.string().trim().min(1)),
  BILLING_RECONCILIATION_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  AZURE_PRIVACY_EXPORT_STORAGE_CONNECTION_STRING: emptyToUndefined(z.string().trim().min(1)),
  AZURE_PRIVACY_EXPORT_STORAGE_CONTAINER: z.string()
    .trim()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/)
    .default("privacy-exports"),
  AZURE_AI_FOUNDRY_PROJECT_ENDPOINT: emptyToUndefined(z.string().url()),
  AZURE_AI_FOUNDRY_API_KEY: emptyToUndefined(z.string().min(1)),
  AZURE_AI_FOUNDRY_MODEL: emptyToUndefined(z.string().min(1)),
  AZURE_AI_FOUNDRY_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  INNGEST_APP_ID: z.string().trim().min(1).default("certdrills-api"),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY_FALLBACK: z.string().optional(),
  INNGEST_DEV: z.string()
    .trim()
    .toLowerCase()
    .pipe(z.enum(["true", "false", "1", "0"]))
    .transform((value) => value === "true" || value === "1")
    .default(false),
  JWT_SECRET: z.string().min(16),
  JWT_ISSUER: z.string().default("api"),
  JWT_AUDIENCE: z.string().default("mobile-clients"),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),
}).superRefine((value, ctx) => {
  if (value.DODO_PAYMENTS_WEBHOOK_SECRET && !value.DODO_PAYMENTS_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DODO_PAYMENTS_API_KEY"],
      message: "DODO_PAYMENTS_API_KEY is required when DODO_PAYMENTS_WEBHOOK_SECRET is configured",
    });
  }

  if (value.NODE_ENV !== "production") return;

  for (const key of ["BETTER_AUTH_SECRET", "JWT_SECRET"] as const) {
    if (placeholderSecrets.has(value[key]) || value[key].length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} must be a non-placeholder production secret with at least 32 characters`,
      });
    }
  }


  for (const key of ["ADMIN_SECRET", "BILLING_RECONCILIATION_SECRET"] as const) {
    const secret = value[key];
    if (!secret || placeholderSecrets.has(secret) || secret.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} must be configured in production with at least 32 characters`,
      });
    }
  }

  for (const key of ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"] as const) {
    if (!value[key]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} must be configured in production`,
      });
    }
  }

  if (!value.AZURE_PRIVACY_EXPORT_STORAGE_CONNECTION_STRING) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["AZURE_PRIVACY_EXPORT_STORAGE_CONNECTION_STRING"],
      message: "AZURE_PRIVACY_EXPORT_STORAGE_CONNECTION_STRING must be configured in production",
    });
  }

  for (const key of ["APP_URL", "API_URL"] as const) {
    if (new URL(value[key]).protocol !== "https:") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} must use https in production`,
      });
    }
  }

  if (value.PAYMENT_PROVIDER === "dodo") {
    const brandKey = DODO_BRAND_ENV_BY_BILLING_MODE[applicationConfig.billing.mode];
    if (!value[brandKey]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [brandKey],
        message: `${brandKey} is required for the active Dodo billing mode in production`,
      });
    }
  }

  if (value.DODO_PAYMENTS_ENVIRONMENT === "live_mode") {
    for (const key of ["DODO_PAYMENTS_API_KEY", "DODO_PAYMENTS_WEBHOOK_SECRET"] as const) {
      if (!value[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required for live payments`,
        });
      }
    }

    if (value.DODO_LIVE_MODE_APPROVED !== "approved-live-payments") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DODO_LIVE_MODE_APPROVED"],
        message: "DODO_LIVE_MODE_APPROVED must explicitly approve live payments",
      });
    }
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables for api", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
