import { z } from "zod";

import { errorResultSchema, successResultSchema, voidResultSchema } from "../common/result";

export const mobileTokenResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    accessToken: z.string().min(16),
    refreshToken: z.string().min(16),
    expiresInSeconds: z.number().int().positive(),
    tokenType: z.literal("Bearer"),
  }),
});

export const mobileTokenErrorSchema = z.object({
  success: z.literal(false),
  error: z.string().min(1),
});

export const mobileTokenResultSchema = z.union([
  mobileTokenResponseSchema,
  mobileTokenErrorSchema,
]);

export const sessionUserSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1).nullable().optional(),
  email: z.string().min(1).nullable().optional(),
});

export const sessionResponseSchema = successResultSchema(sessionUserSchema);
export const authActionResponseSchema = z.union([voidResultSchema, errorResultSchema]);

export type SessionUser = z.infer<typeof sessionUserSchema>;
