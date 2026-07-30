import { z } from "zod";

export const consumeCreditsRequestSchema = z.object({
  featureKey: z.string().trim().min(1).max(100),
  amount: z.number().positive().max(100_000),
  idempotencyKey: z.string().trim().min(8).max(128),
  description: z.string().trim().min(1).max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ConsumeCreditsRequest = z.infer<typeof consumeCreditsRequestSchema>;

export const apiKeyScopeSchema = z.enum(["read:profile", "read:billing", "read:credits"]);

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(apiKeyScopeSchema).min(1).max(3),
  expiresAt: z.string().datetime().optional(),
});

export const revokeApiKeyParamSchema = z.object({
  keyId: z.string().uuid(),
});

export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;
export type CreateApiKeyRequest = z.infer<typeof createApiKeySchema>;
