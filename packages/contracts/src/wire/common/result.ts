import { z } from "zod";

export const errorResultSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  }),
  requestId: z.string().min(1).optional(),
});

export const successResultSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

export const actionResultSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.union([successResultSchema(dataSchema), errorResultSchema]);

export const voidResultSchema = successResultSchema(z.null());

export const countResultSchema = successResultSchema(
  z.object({
    count: z.number().int().nonnegative(),
  }),
);

export type SuccessResult<T> = { success: true; data: T };
export type ErrorResult = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
};
export type ActionResult<T> = SuccessResult<T> | ErrorResult;
