import { z } from "zod";

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  });
