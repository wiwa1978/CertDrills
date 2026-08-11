import { z } from "zod";

export const optionalLimitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const timeRangeSchema = z.enum(["daily", "weekly", "monthly", "yearly"]);
export const supportedLocaleSchema = z.enum(["en", "fr", "nl"]);

export const countriesQuerySchema = z.object({
  lang: supportedLocaleSchema.default("en"),
});

export type SupportedLocale = z.infer<typeof supportedLocaleSchema>;
