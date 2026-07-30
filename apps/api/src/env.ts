import { z } from "zod";

const emptyToUndefined = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  z.preprocess((value) => {
    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }

    return value;
  }, schema.optional());

const booleanString = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true" || normalized === "1") return true;
      if (normalized === "false" || normalized === "0") return false;
    }

    return value;
  }, z.boolean().default(defaultValue));

const placeholderSecrets = new Set([
  "replace-with-strong-secret",
  "changeme",
  "change-me",
]);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8877),
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
  TRUST_PROXY: z.coerce.boolean().default(false),
  PAYMENT_PROVIDER: z.enum(["dodo", "stripe"]).default("dodo"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  DODO_PAYMENTS_API_KEY: z.string().optional(),
  DODO_PAYMENTS_WEBHOOK_SECRET: z.string().optional(),
  DODO_PAYMENTS_ENVIRONMENT: z.enum(["test_mode", "live_mode"]).default("test_mode"),
  BILLING_RECONCILIATION_SECRET: z.string().optional(),
  JOBS_SECRET_KEY: z.string().optional(),
  FEATURE_CERTDRILL_ENABLED: booleanString(true),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  JWT_SECRET: z.string().min(16),
  JWT_ISSUER: z.string().default("api"),
  JWT_AUDIENCE: z.string().default("mobile-clients"),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),
}).superRefine((value, ctx) => {
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

  for (const key of ["ADMIN_SECRET", "BILLING_RECONCILIATION_SECRET", "JOBS_SECRET_KEY"] as const) {
    const secret = value[key];
    if (!secret || placeholderSecrets.has(secret) || secret.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} must be configured in production with at least 32 characters`,
      });
    }
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
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables for api", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
