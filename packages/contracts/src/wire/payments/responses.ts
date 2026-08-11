import { z } from "zod";

import { successResultSchema } from "../common/result";

export const createCheckoutResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    checkoutUrl: z.string().url(),
  }),
});

export type CreateCheckoutResponse = z.infer<typeof createCheckoutResponseSchema>;

export const customerPortalResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    portalUrl: z.string().url(),
  }),
});

export type CustomerPortalResponse = z.infer<typeof customerPortalResponseSchema>;

export const invoiceDataSchema = z.object({
  invoiceUrl: z.string().url(),
});

export const invoiceResponseSchema = successResultSchema(invoiceDataSchema);
