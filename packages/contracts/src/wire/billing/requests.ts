import { z } from "zod";

export const consumeCreditsRequestSchema = z.object({
  featureKey: z.string().trim().min(1).max(100),
  idempotencyKey: z.string().trim().min(8).max(128),
  description: z.string().trim().min(1).max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ConsumeCreditsRequest = z.infer<typeof consumeCreditsRequestSchema>;


export const capabilityKeyParamSchema = z.object({
  capabilityKey: z.string().trim().min(1).max(100),
});

export const consumeCapabilityRequestSchema = consumeCreditsRequestSchema.omit({ featureKey: true });
export type ConsumeCapabilityRequest = z.infer<typeof consumeCapabilityRequestSchema>;
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

export const transactionBasketItemRequestSchema = z.object({
  productKey: z.string().trim().min(1).max(100),
  quantity: z.number().int().min(1).max(100),
});

export const transactionProductKeyParamsSchema = z.object({
  productKey: z.string().trim().min(1).max(100),
});

export const transactionOrderParamsSchema = z.object({
  orderId: z.string().trim().min(1).max(255),
});

export const transactionEntitlementConsumeParamsSchema = z.object({
  entitlementId: z.string().uuid(),
});

export type TransactionBasketItemRequest = z.infer<typeof transactionBasketItemRequestSchema>;
export type TransactionProductKeyParams = z.infer<typeof transactionProductKeyParamsSchema>;
export type TransactionOrderParams = z.infer<typeof transactionOrderParamsSchema>;
export type TransactionEntitlementConsumeParams = z.infer<typeof transactionEntitlementConsumeParamsSchema>;
