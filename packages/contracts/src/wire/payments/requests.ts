import { z } from "zod";

const checkoutKeySchema = z.string().trim().min(1).max(64);

const checkoutAddressSchema = z.object({
  street: z.string().trim().min(1).max(255),
  number: z.string().trim().min(1).max(64),
  zipcode: z.string().trim().min(1).max(64),
  town: z.string().trim().min(1).max(255),
  countryId: z.string().trim().min(1).max(255),
}).optional();

export const createCheckoutRequestSchema = z.union([
  z.object({
    billingMode: z.literal("credits"),
    packageKey: checkoutKeySchema,
    discountCode: checkoutKeySchema.optional(),
    address: checkoutAddressSchema,
  }),
  z.object({
    billingMode: z.literal("subscriptions"),
    planKey: checkoutKeySchema,
    discountCode: checkoutKeySchema.optional(),
    address: checkoutAddressSchema,
  }),
  z.object({
    packageKey: checkoutKeySchema,
    discountCode: checkoutKeySchema.optional(),
    address: checkoutAddressSchema,
  }),
]);

export const invoiceRequestSchema = z.object({
  paymentId: z.string().trim().min(1).max(255),
});
