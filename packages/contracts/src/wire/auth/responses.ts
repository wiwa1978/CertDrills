import { z } from "zod";

import { errorResultSchema, successResultSchema, voidResultSchema } from "../common/result";

export const mobileTokenDataSchema = z.object({
  accessToken: z.string().min(16),
  refreshToken: z.string().min(16),
  expiresInSeconds: z.number().int().positive(),
  tokenType: z.literal("Bearer"),
});

export const mobileTokenResponseSchema = successResultSchema(mobileTokenDataSchema);
export const mobileTokenErrorSchema = errorResultSchema;
export const mobileTokenResultSchema = z.union([
  mobileTokenResponseSchema,
  mobileTokenErrorSchema,
]);

export const mobileRevokeResponseSchema = successResultSchema(z.object({ revoked: z.literal(true) }));

export type MobileTokenData = z.infer<typeof mobileTokenDataSchema>;
export type MobileTokenResult = z.infer<typeof mobileTokenResultSchema>;

export const sessionUserSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1).nullable().optional(),
  email: z.string().min(1).nullable().optional(),
});

export const sessionResponseSchema = successResultSchema(sessionUserSchema);
export const authActionResponseSchema = z.union([voidResultSchema, errorResultSchema]);

export type SessionUser = z.infer<typeof sessionUserSchema>;
