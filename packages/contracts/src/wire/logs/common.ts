import { z } from "zod";

export const logLevelSchema = z.enum(["debug", "info", "warn", "error"]);
export const logStreamSchema = z.enum(["app", "audit"]);

export const clientLogSchema = z.object({
  source: z.string().trim().min(1).max(32).default("web"),
  level: logLevelSchema.default("error"),
  message: z.string().trim().min(1).max(5000),
  context: z.unknown().optional(),
  url: z.string().optional(),
  userAgent: z.string().optional(),
  timestamp: z.string().optional(),
});

export const logFilesQuerySchema = z.object({
  stream: logStreamSchema.default("app"),
});

export const logFileNameSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}(?:\.audit)?\.jsonl$/);

export const logEntriesQuerySchema = z.object({
  stream: logStreamSchema.default("app"),
  file: logFileNameSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type ClientLogInput = z.infer<typeof clientLogSchema>;
export type LogStream = z.infer<typeof logStreamSchema>;
